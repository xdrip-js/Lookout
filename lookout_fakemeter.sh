#!/bin/bash

die() {
  echo "$@"
  exit 1
}

meterId=$1
calibratedBG=$2

myopenaps=${3-~/myopenaps}

[[ "$calibratedBG" =~ ^[0-9]+$ ]] || die "Valid glucose value not provided"
[[ "$meterId" =~ ^[0-9]+$ ]] || die "Valid meterid not provided"

[[ -s ${myopenaps}/pump.ini ]] || die "Unable to find pump.ini file: ${myopenaps}/pump.ini"
export MEDTRONIC_PUMP_ID=`grep serial ${myopenaps}/pump.ini | tr -cd 0-9`

[[ -s ${myopenaps}/monitor/medtronic_frequency.ini ]] || die "Unable to find medtronic_frequency.ini file: ${myopenaps}/monitor/medtronic_frequency.ini"
export MEDTRONIC_FREQUENCY=`cat ${myopenaps}/monitor/medtronic_frequency.ini`

if ! listen -t 4s >& /dev/null ; then
  echo "Sending BG of $calibratedBG to pump via meterid $meterid"
  fakemeter -m $meterid  $calibratedBG
else
  echo "Timed out trying to send BG of $calibratedBG to pump via meterid $meterid"
fi

