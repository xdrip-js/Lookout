#!/bin/bash

# date +'%Y-%m-%d %H:%M:%S'
glucoseType="unfiltered"

function log 
{
  echo "$(date +'%m/%d %H:%M:%S') $*"
}

cd /root/src/Lookout
mkdir -p old-calibrations

log "Starting Lookout expired transmitter bash script process-entry.sh"

# Check required environment variables
source ~/.bash_profile
export API_SECRET
export NIGHTSCOUT_HOST
if [ "$API_SECRET" = "" ]; then
   log "API_SECRET environment variable is not set"
   log "Make sure the two lines below are in your ~/.bash_profile as follows:\n"
   log "API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx # where xxxx is your hashed NS API_SECRET"
   log "export API_SECRET\n\nexiting\n"
   exit
fi
if [ "$NIGHTSCOUT_HOST" = "" ]; then
   log "NIGHTSCOUT_HOST environment variable is not set"
   log "Make sure the two lines below are in your ~/.bash_profile as follows:\n"
   log "NIGHTSCOUT_HOST=https://xxxx # where xxxx is your hashed Nightscout url"
   log "export NIGHTSCOUT_HOST\n\nexiting\n"
   exit
fi

function ClearCalibrationInput()
{
  if [ -e ./calibrations.csv ]; then
    cp ./calibrations.csv "./old-calibrations/calibrations.csv.$(date +%Y%m%d-%H%M%S)" 
    rm ./calibrations.csv
  fi
}

# we need to save the last calibration for meterbgid checks, throw out the rest
function ClearCalibrationInputOne()
{
  if [ -e ./calibrations.csv ]; then
    howManyLines=$(wc -l ./calibrations.csv | awk '{print $1}')
    if [ $(bc <<< "$howManyLines > 1") -eq 1 ]; then
      cp ./calibrations.csv "./old-calibrations/calibrations.csv.$(date +%Y%m%d-%H%M%S)"
      tail -1 ./calibrations.csv > ./calibrations.csv.new
      rm ./calibrations.csv
      mv ./calibrations.csv.new ./calibrations.csv
    fi
  fi
}

function ClearCalibrationCache()
{
  local cache="calibration-linear.json"
  if [ -e $cache ]; then
    cp $cache "./old-calibrations/${cache}.$(date +%Y%m%d-%H%M%S)" 
    rm $cache 
  fi
}

noiseSend=0 # default unknown
UTC=" -u "
# check UTC to begin with and use UTC flag for any curls
curl --compressed -m 30 "${NIGHTSCOUT_HOST}/api/v1/treatments.json?count=1&find\[created_at\]\[\$gte\]=$(date -d "2400 hours ago" -Ihours -u)&find\[eventType\]\[\$regex\]=Sensor.Change" 2>/dev/null  > ./testUTC.json  
if [ $? == 0 ]; then
  createdAt=$(jq ".[0].created_at" ./testUTC.json)
  if [ $"$createdAt" == "" ]; then
    log "You must record a \"Sensor Insert\" in Nightscout before Logger will run" 
    log "exiting\n"
    exit
  elif [[ $createdAt == *"Z"* ]]; then
    UTC=" -u "
    log "NS is using UTC $UTC"      
  else
    UTC=""
    log "NS is not using UTC $UTC"      
  fi
fi

# remove old calibration storage when sensor change occurs
# calibrate after 15 minutes of sensor change time entered in NS
#
curl --compressed -m 30 "${NIGHTSCOUT_HOST}/api/v1/treatments.json?find\[created_at\]\[\$gte\]=$(date -d "15 minutes ago" -Iminutes $UTC)&find\[eventType\]\[\$regex\]=Sensor.Change" 2>/dev/null | grep "Sensor Change"
if [ $? == 0 ]; then
  log "sensor change within last 15 minutes - clearing calibration files"
  ClearCalibrationInput
  ClearCalibrationCache
  touch ./last_sensor_change
  log "exiting"
  exit
fi

if [ -e "./last-entry.json" ] ; then
  lastGlucose=$(cat ./last-entry.json | jq -M '.[0].glucose')
  log "lastGlucose=$lastGlucose"
  cp ./g5entry.json ./last-entry.json
else
  log "last-entry.json not available, setting lastGlucose=0"
  lastGlucose=0
fi

# need to send these through from Lookout somehow
meterid=${2:-"000000"}
pumpUnits=${3:-"mg/dl"}

log "processing Lookout glucose entry record below ..."
cat ./g5entry.json
glucose=$(cat ./g5entry.json | jq -M '.[0].glucose')

if [ -z "${glucose}" ] ; then
  log "Invalid glucose record from Lookout"
  ls -al ./g5entry.json
  rm ./g5entry.json
  exit
fi

# capture raw values for use and for log to csv file 
unfiltered=$(cat ./g5entry.json | jq -M '.[0].unfiltered')
filtered=$(cat ./g5entry.json | jq -M '.[0].filtered')
transmitter=$(cat ./g5entry.json | jq -M '.[0].device')

# get dates for use in filenames and json entries
datetime=$(date +"%Y-%m-%d %H:%M")
epochdate=$(date +'%s')

log "Using glucoseType of $glucoseType"
if [ "glucoseType" == "filtered" ]; then
  raw=$filtered
else
  raw=$unfiltered
fi
log "raw glucose to be used for calibration = $raw"

# begin calibration logic - look for calibration from NS, use existing calibration or none
ns_url="${NIGHTSCOUT_HOST}"
METERBG_NS_RAW="meterbg_ns_raw.json"

rm -f $METERBG_NS_RAW # clear any old meterbg curl responses

# look for a bg check from pumphistory (direct from meter->openaps):
# note: pumphistory may not be loaded by openaps very timely...
meterbgafter=$(date -d "9 minutes ago" -Iminutes)
meterjqstr="'.[] | select(._type == \"BGReceived\") | select(.timestamp > \"$meterbgafter\")'"
bash -c "jq $meterjqstr ~/myopenaps/monitor/pumphistory-merged.json" > $METERBG_NS_RAW
meterbg=$(bash -c "jq .amount $METERBG_NS_RAW")
meterbgid=$(bash -c "jq .timestamp $METERBG_NS_RAW")
# meter BG from pumphistory doesn't support mmol yet - has no units...
# using arg3 if mmol then convert it
if [[ "$pumpUnits" == *"mmol"* ]]; then
  meterbg=$(bc <<< "($meterbg *18)/1")
  log "converted pump history meterbg from mmol value to $meterbg"
fi
echo
log "meterbg from pumphistory: $meterbg"

# look for a bg check from monitor/calibration.json
if [ -z $meterbg ]; then
  CALFILE="/root/myopenaps/monitor/calibration.json"
  if [ -e $CALFILE ]; then
    if test  `find $CALFILE -mmin -7`
    then
      log "calibration file $CALFILE contents below"
      cat $CALFILE
      echo
      calDate=$(jq ".[0].date" $CALFILE)
      # check the date inside to make sure we don't calibrate using old record
      if [ $(bc <<< "($epochdate - $calDate) < 420") -eq 1 ]; then
         calDate=$(jq ".[0].date" $CALFILE)
         meterbg=$(jq ".[0].glucose" $CALFILE)
         meterbgid=$(jq ".[0].dateString" $CALFILE)
         meterbgid="${meterbgid%\"}"
         meterbgid="${meterbgid#\"}"
         units=$(jq ".[0].units" $CALFILE)
         if [[ "$units" == *"mmol"* ]]; then
           meterbg=$(bc <<< "($meterbg *18)/1")
           log "converted OpenAPS meterbg from mmol value to $meterbg"
         fi
         log "Calibration of $meterbg from $CALFILE being processed - id = $meterbgid"
         # put in backfill so that the command line calibration will be sent up to NS 
         # now (or later if offline)
        log "Setting up to send calibration to NS now if online (or later with backfill)"
        echo "[{\"created_at\":\"$meterbgid\",\"enteredBy\":\"OpenAPS\",\"reason\":\"sensor calibration\",\"eventType\":\"BG Check\",\"glucose\":$meterbg,\"glucoseType\":\"Finger\",\"units\":\"mg/dl\"}]" > ./calibration-backfill.json
        cat ./calibration-backfill.json
        jq -s add ./calibration-backfill.json ./treatments-backfill.json > ./treatments-backfill.json
      else
        log "Calibration bg over 7 minutes - not used"
      fi
    fi
    
    rm $CALFILE
  fi
fi
log "meterbg from monitor/calibration.json: $meterbg"

maxDelta=30
if [ -z $meterbg ]; then
  # can't use the Sensor insert UTC determination for BG since they can
  # be entered in either UTC or local time depending on how they were entered.
  curl --compressed -m 30 "${ns_url}/api/v1/treatments.json?find\[eventType\]\[\$regex\]=Check&count=1" 2>/dev/null > $METERBG_NS_RAW
  createdAt=$(jq -r ".[0].created_at" $METERBG_NS_RAW)
  secNow=`date +%s`
  secThen=`date +%s --date=$createdAt`
  elapsed=$(bc <<< "($secNow - $secThen)")
  log "meterbg date=$createdAt, secNow=$secNow, secThen=$secThen, elapsed=$elapsed"
  if [ $(bc <<< "$elapsed < 540") -eq 1 ]; then
    # note: pumphistory bg has no _id field, but .timestamp matches .created_at
    meterbgid=$(jq ".[0].created_at" $METERBG_NS_RAW)
    meterbgid="${meterbgid%\"}"
    meterbgid="${meterbgid#\"}"
    meterbgunits=$(cat $METERBG_NS_RAW | jq -M '.[0] | .units')
    meterbg=`jq -M '.[0] .glucose' $METERBG_NS_RAW`
    meterbg="${meterbg%\"}"
    meterbg="${meterbg#\"}"
    if [[ "$meterbgunits" == *"mmol"* ]]; then
      meterbg=$(bc <<< "($meterbg *18)/1")
    fi
  else
    # clear old meterbg curl responses
    rm $METERBG_NS_RAW
  fi
  log "meterbg from nightscout: $meterbg"
fi


calibrationDone=0
if [ -n $meterbg ]; then 
  if [ "$meterbg" != "null" -a "$meterbg" != "" ]; then
    if [ $(bc <<< "$meterbg < 400") -eq 1  -a $(bc <<< "$meterbg > 40") -eq 1 ]; then
      # only do this once for a single calibration check for duplicate BG check record ID
      if ! cat ./calibrations.csv | egrep "$meterbgid"; then 
        # safety check to make sure we don't have wide variance between the meterbg and the unfiltered/raw value
        # Use 1000 as slope for safety in this check
        meterbg_raw_delta=$(bc -l <<< "$meterbg - $raw/1000")
        # calculate absolute value
        if [ $(bc -l <<< "$meterbg_raw_delta < 0") -eq 1 ]; then
	  meterbg_raw_delta=$(bc -l <<< "0 - $meterbg_raw_delta")
        fi
        if [ $(bc -l <<< "$meterbg_raw_delta > 70") -eq 1 ]; then
	  log "Raw/unfiltered compared to meterbg is $meterbg_raw_delta > 70, ignoring calibration"
        else
          echo "$raw,$meterbg,$datetime,$epochdate,$meterbgid,$filtered,$unfiltered" >> ./calibrations.csv
          ./calc-calibration.sh ./calibrations.csv ./calibration-linear.json
          maxDelta=60
          calibrationDone=1
          cat ./calibrations.csv
          cat ./calibration-linear.json
        fi
      else 
        log "this calibration was previously recorded - ignoring"
      fi
    else
      log "Invalid calibration, meterbg="${meterbg}" outside of range [40,400]"
    fi
  fi
fi

# check if sensor changed in last 12 hours.
# If so, clear calibration inputs and only calibrate using single point calibration
# do not keep the calibration records within the first 12 hours as they might skew LSR
if [ -e ./last_sensor_change ]; then
  if test  `find ./last_sensor_change -mmin -720`
  then
    log "sensor change within last 12 hours - will use single pt calibration"
    ClearCalibrationInputOne
  fi
fi

if [ -e ./calibration-linear.json ]; then
  slope=`jq -M '.[0] .slope' ./calibration-linear.json` 
  yIntercept=`jq -M '.[0] .yIntercept' ./calibration-linear.json` 
  slopeError=`jq -M '.[0] .slopeError' ./calibration-linear.json` 
  yError=`jq -M '.[0] .yError' ./calibration-linear.json` 
  calibrationType=`jq -M '.[0] .calibrationType' ./calibration-linear.json` 
  calibrationType="${calibrationType%\"}"
  calibrationType="${calibrationType#\"}"
  numCalibrations=`jq -M '.[0] .numCalibrations' ./calibration-linear.json` 
  rSquared=`jq -M '.[0] .rSquared' ./calibration-linear.json` 

  if [ "$calibrationDone" == "1" ];then
    # new calibration record log it to NS
    echo "[{\"device\":\"$transmitter\",\"type\":\"cal\",\"date\":$epochdate,\"scale\":1,\"intercept\":$yIntercept,\"slope\":$slope}]" > cal.json 
    log "Posting cal record to NightScout"
./post-ns.sh ./cal.json && (echo; log "Upload to NightScout of cal record entry worked";) || (echo; log "Upload to NS of cal record did not work")
  fi
else
  # exit until we have a valid calibration record
  log "no valid calibration record yet, exiting ..."
  exit
fi


# $raw is either unfiltered or filtered value from g5
# based upon glucoseType variable at top of script
calibratedBG=$(bc -l <<< "($raw - $yIntercept)/$slope")
calibratedBG=$(bc <<< "($calibratedBG / 1)") # truncate
log "After calibration calibratedBG =$calibratedBG, slope=$slope, yIntercept=$yIntercept, filtered=$filtered, unfiltered=$unfiltered, raw=$raw"

# For Single Point calibration, use a calculated corrective intercept
# for glucose in the range of 70 <= BG < 85
# per https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4764224
# AdjustedBG = BG - CI
# CI = a1 * BG^2 + a2 * BG + a3
# a1=-0.1667, a2=25.66667, a3=-977.5
c=$calibratedBG
log "numCalibrations=$numCalibrations, calibrationType=$calibrationType, c=$c"
if [ "$calibrationType" = "SinglePoint" ]; then
  log "inside CalibrationType=$calibrationType, c=$c"
  if [ $(bc <<< "$c > 69") -eq 1 -a $(bc <<< "$c < 85") -eq 1 ]; then
    log "SinglePoint calibration calculating corrective intercept"
    log "Before CI, BG=$c"
    calibratedBG=$(bc -l <<< "$c - (-0.16667 * ${c}^2 + 25.6667 * ${c} - 977.5)")
    calibratedBG=$(bc <<< "($calibratedBG / 1)") # truncate
    log "After CI, BG=$calibratedBG"
  else
    log "Not using CI because bg not in [70-84]"
  fi
fi

if [ -z $calibratedBG ]; then
  # Outer calibrated BG boundary checks - exit and don't send these on to Nightscout / openaps
  if [ $(bc <<< "$calibratedBG > 600") -eq 1 -o $(bc <<< "$calibratedBG < 0") -eq 1 ]; then
    log "Glucose $calibratedBG out of range [0,600] - exiting"
    exit
  fi

  # Inner Calibrated BG boundary checks for case > 400
  if [ $(bc <<< "$calibratedBG > 400") -eq 1 ]; then
    log "Glucose $calibratedBG over 400 - setting noise level Heavy"
    log "BG value will show in Nightscout but Openaps will not use it for looping"
    noiseSend=4
  fi

  # Inner Calibrated BG boundary checks for case < 40
  if [ $(bc <<< "$calibratedBG < 40") -eq 1 ]; then
    log "Glucose $calibratedBG < 40 - setting noise level Light"
    log "BG value will show in Nightscout and Openaps will conservatively use it for looping"
    noiseSend=2
  fi
fi

if [ -z $lastGlucose -o $(bc <<< "$lastGlucose < 40") -eq 1 ] ; then
  dg=0
else
  dg=$(bc <<< "$calibratedBG - $lastGlucose")
fi
log "lastGlucose=$lastGlucose, dg=$dg"

# begin try out averaging last two entries ...
da=$dg
if [ -n $da -a $(bc <<< "$da < 0") -eq 1 ]; then
  da=$(bc <<< "0 - $da")
fi
if [ "$da" -lt "45" -a "$da" -gt "15" ]; then
 log "Before Average last 2 entries - lastGlucose=$lastGlucose, dg=$dg, calibratedBG=$calibratedBG"
 calibratedBG=$(bc <<< "($calibratedBG + $lastGlucose)/2")
 dg=$(bc <<< "$calibratedBG - $lastGlucose")
 log "After average last 2 entries - lastGlucose=$lastGlucose, dg=$dg, calibratedBG=${calibratedBG}"
fi
# end average last two entries if noise


if [ $(bc <<< "$dg > $maxDelta") -eq 1 -o $(bc <<< "$dg < (0 - $maxDelta)") -eq 1 ]; then
  log "Change $dg out of range [$maxDelta,-${maxDelta}] - setting noise=Heavy"
  noiseSend=4
fi

cp g5entry.json entry-before-calibration.json

tmp=$(mktemp)
jq ".[0].glucose = $calibratedBG" g5entry.json > "$tmp" && mv "$tmp" g5entry.json

tmp=$(mktemp)
jq ".[0].sgv = $calibratedBG" g5entry.json > "$tmp" && mv "$tmp" g5entry.json


direction='NONE'
trend=0

# Begin trend calculation logic based on last 15 minutes glucose delta average
if [ -z "$dg" ]; then
  direction="NONE"
  log "setting direction=NONE because dg is null, dg=$dg"
else
  usedRecords=0
  totalDelta=0
# Don't use files to store delta's anymore. Use monitor/glucose.json in order to 
# be able to support multiple rigs running openaps / Logger at same time. 

#  after=$(date -d "15 minutes ago" -Iminutes)
#  glucosejqstr="'[ .[] | select(.dateString > \"$after\") ]'"
  epms15=$(bc -l <<< "$epochdate *1000  - 900000")
  glucosejqstr="'[ .[] | select(.date > $epms15) ]'"
  bash -c "jq -c $glucosejqstr ~/myopenaps/monitor/glucose.json" > last15minutes.json
  last3=( $(jq -r ".[].glucose" last15minutes.json) )
  date3=( $(jq -r ".[].date" last15minutes.json) )
  #echo ${last3[@]}

  usedRecords=${#last3[@]}
  totalDelta=$dg

  for (( i=1; i<$usedRecords; i++ ))
  do
    #echo "before totalDelta=$totalDelta, last3[i-1]=${last3[$i-1]}, last3[i]=${last3[$i]}"
    totalDelta=$(bc <<< "$totalDelta + (${last3[$i-1]} - ${last3[$i]})")
    #echo "after totalDelta=$totalDelta"
  done

  if [ $(bc <<< "$usedRecords > 0") -eq 1 ]; then
    numMinutes=$(bc -l <<< "($epochdate-(${date3[$usedRecords-1]}/1000))/60")
    perMinuteAverageDelta=$(bc -l <<< "$totalDelta / $numMinutes")
    log "direction calculation based on $numMinutes minutes"
    log "perMinuteAverageDelta=$perMinuteAverageDelta"

    if (( $(bc <<< "$perMinuteAverageDelta > 3") )); then
      direction='DoubleUp'
      trend=1
    elif (( $(bc <<< "$perMinuteAverageDelta > 2") )); then
      direction='SingleUp'
      trend=2
    elif (( $(bc <<< "$perMinuteAverageDelta > 1") )); then
      direction='FortyFiveUp'
      trend=3
    elif (( $(bc <<< "$perMinuteAverageDelta < -3") )); then
      direction='DoubleDown'
      trend=7
    elif (( $(bc <<< "$perMinuteAverageDelta < -2") )); then
      direction='SingleDown'
      trend=6
    elif (( $(bc <<< "$perMinuteAverageDelta < -1") )); then
      direction='FortyFiveDown'
      trend=5
    else
      direction='Flat'
      trend=4
    fi
  fi
fi

log "perMinuteAverageDelta=$perMinuteAverageDelta, totalDelta=$totalDelta, usedRecords=$usedRecords"
log "Gluc=${calibratedBG}, last=${lastGlucose}, diff=${dg}, dir=${direction}"

cat g5entry.json | jq ".[0].direction = \"$direction\"" > entry-xdrip.json

tmp=$(mktemp)
jq ".[0].trend = $trend" entry-xdrip.json > "$tmp" && mv "$tmp" entry-xdrip.json

if [ ! -f "/var/log/openaps/g5.csv" ]; then
  echo "epochdate,datetime,unfiltered,filtered,direction,calibratedBG,meterbg,slope,yIntercept,slopeError,yError,rSquared,Noise,NoiseSend" > /var/log/openaps/g5.csv
fi


echo "${epochdate},${unfiltered},${filtered},${calibratedBG}" >> ./noise-input.csv


# calculate the noise and position it for updating the entry sent to NS and xdripAPS
if [ $(bc -l <<< "$noiseSend == 0") -eq 1 ]; then
  # means that noise was not already set before
  # get last 41 minutes (approx 7 BG's) from monitor/glucose to better support multiple rigs
  # 
#  tail -8 ./noise-input.csv > ./noise-input12.csv
#
# be able to support multiple rigs running openaps / Logger at same time. 
#  after=$(date -d "41 minutes ago" -Iminutes)
  epms15=$(bc -l <<< "$epochdate *1000  - 41*60000")
  glucosejqstr="'[ .[] | select(.date > $epms15) ]'"
#  glucosejqstr="'[ .[] | select(.dateString > \"$after\") ]'"
  bash -c "jq -c $glucosejqstr ~/myopenaps/monitor/glucose.json" > last41minutes.json
  date41=( $(jq -r ".[].date" last41minutes.json) )
  gluc41=( $(jq -r ".[].glucose" last41minutes.json) )
  unf41=( $(jq -r ".[].unfiltered" last41minutes.json) )
  fil41=( $(jq -r ".[].filtered" last41minutes.json) )

  usedRecords=${#gluc41[@]}
  log usedRecords=$usedRecords last 41 minutes = ${gluc41[@]}

  truncate -s 0 ./noise-input41.csv
  for (( i=$usedRecords-1; i>=0; i-- ))
  do
    dateSeconds=$(bc <<< "${date41[$i]} / 1000")
    echo "$dateSeconds,${unf41[$i]},${fil41[$i]},${gluc41[$i]}" >> ./noise-input41.csv
  done
  echo "${epochdate},${unfiltered},${filtered},${calibratedBG}" >> ./noise-input41.csv

  if [ -e "./calc-noise" ]; then
    # use the go-based version
    log "calculating noise using go-based version"
    ./calc-noise ./noise-input41.csv ./noise.json
  else 
    log "calculating noise using bash-based version"
    ./calc-noise.sh ./noise-input41.csv ./noise.json
  fi

  if [ -e ./noise.json ]; then
    noise=`jq -M '.[0] .noise' ./noise.json` 
    # remove issue where jq returns scientific notation, convert to decimal
    noise=$(awk -v noise="$noise" 'BEGIN { printf("%.2f", noise) }' </dev/null)
    log "Raw noise of $noise will be used to determine noiseSend value."
  fi

  if [ $(bc -l <<< "$noise < 0.35") -eq 1 ]; then
    noiseSend=1  # Clean
  elif [ $(bc -l <<< "$noise < 0.5") -eq 1 ]; then
    noiseSend=2  # Light
  elif [ $(bc -l <<< "$noise < 0.7") -eq 1 ]; then
    noiseSend=3  # Medium
  elif [ $(bc -l <<< "$noise >= 0.7") -eq 1 ]; then
    noiseSend=4  # Heavy
  fi
fi

echo "${epochdate},${datetime},${unfiltered},${filtered},${direction},${calibratedBG},${meterbg},${slope},${yIntercept},${slopeError},${yError},${rSquared},${noise},${noiseSend}" >> /var/log/openaps/g5.csv

tmp=$(mktemp)
jq ".[0].noise = $noiseSend" entry-xdrip.json > "$tmp" && mv "$tmp" entry-xdrip.json


if [ -e "./entry-backfill.json" ] ; then
  # In this case backfill records not yet sent to Nightscout
  jq -s add ./entry-xdrip.json ./entry-backfill.json > ./entry-ns.json
  cp ./entry-ns.json ./entry-backfill.json
  log "entry-backfill.json exists, so setting up for backfill"
else
  log "entry-backfill.json does not exist so no backfill"
  cp ./entry-xdrip.json ./entry-ns.json
fi


log "Posting blood glucose to NightScout"
./post-ns.sh ./entry-ns.json && (echo; log "Upload to NightScout of xdrip entry worked ... removing ./entry-backfill.json"; rm -f ./entry-backfill.json) || (echo; log "Upload to NS of xdrip entry did not work ... saving for upload when network is restored ... Auth to NS may have failed; ensure you are using hashed API_SECRET in ~/.bash_profile"; cp ./entry-ns.json ./entry-backfill.json)
echo

if [ -e "./treatments-backfill.json" ]; then
  log "Posting treatments to NightScout"
  ./post-ns.sh ./treatments-backfill.json treatments && (echo; log "Upload to NightScout of xdrip treatments worked ... removing ./treatments-backfill.json"; rm -f ./treatments-backfill.json) || (echo; log "Upload to NS of xdrip entry did not work ... saving treatments for upload when network is restored ... Auth to NS may have failed; ensure you are using hashed API_SECRET in ~/.bash_profile")
  echo
fi

if [ -e "/usr/local/bin/fakemeter" ]; then
  export MEDTRONIC_PUMP_ID=`grep serial ~/myopenaps/pump.ini | tr -cd 0-9`
  export MEDTRONIC_FREQUENCY=`cat ~/myopenaps/monitor/medtronic_frequency.ini`
  if ! listen -t 3s >& /dev/null ; then 
    log "Sending BG of $calibratedBG to pump via meterid $meterid"
    fakemeter -m $meterid  $calibratedBG 
  else
    log "Timed out trying to send BG of $calibratedBG to pump via meterid $meterid"
  fi
fi

log "Posting glucose record to xdripAPS"
./post-xdripAPS.sh ./entry-xdrip.json

log "Finished Lookout expired transmitter bash script process-entry.sh"
echo
