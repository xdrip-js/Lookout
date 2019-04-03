#!/bin/bash

die() {
    echo "$@"
    exit 1
}

# Usage: wait_for_silence <seconds of silence>
# listen for $1 seconds of silence (no other rigs or enlite transmitter talking to pump) before continuing
# If communication is detected, it'll retry to listen for $1 seconds.
#
# returns 0 if radio is free, 1 if radio is jammed for 800 iterations.
function wait_for_silence {
    if [ -z $1 ]; then
        upto45s=$[ ( $RANDOM / 728 + 1) ]
        waitfor=$upto45s
    else
        waitfor=$1
    fi
    echo -n "Listening for ${waitfor}s: "
    for i in $(seq 1 800); do
        echo -n .
        # returns true if it hears pump comms, false otherwise
        if ! listen -t $waitfor's' ; then
            echo "No interfering pump comms detected from other rigs (this is a good thing!)"
            echo -n "Continuing lookout_fakemeter at "; date
            return 0
        else
            sleep 1
        fi
    done
    return 1
}

retry_fail() {
    "$@" || { echo Retry 1 of $*; "$@"; } \
    || { wait_for_silence $upto10s; echo Retry 2 of $*; "$@"; } \
    || { wait_for_silence $upto30s; echo Retry 3 of $*; "$@"; } \
    || { echo "Couldn't $*"; die "$@"; }
}

call_fakemeter() {
    fakemeter -m $meterId  $calibratedBG
}

send_glucose() {
    if [ -d ~/myopenaps/plugins/once ]; then
        scriptf=~/myopenaps/plugins/once/run_fakemeter.sh
        cat | sed -r 's/^ {4}//' > $scriptf << '        EOF'
        #!/bin/bash
        fakemeter -m $meterId $calibratedBG
        EOF

        chmod +x $scriptf
    else
        retry_fail call_fakemeter
    fi
}

meterId=$1
calibratedBG=$2

myopenaps=${3-~/myopenaps}

upto10s=$[ ( $RANDOM / 3277 + 1) ]
upto30s=$[ ( $RANDOM / 1092 + 1) ]
upto45s=$[ ( $RANDOM / 728 + 1) ]

[[ "$calibratedBG" =~ ^[0-9]+$ ]] || die "Valid glucose value not provided"
[[ "$meterId" =~ ^[0-9]+$ ]] || die "Valid meterid not provided"

[[ -s ${myopenaps}/pump.ini ]] || die "Unable to find pump.ini file: ${myopenaps}/pump.ini"
export MEDTRONIC_PUMP_ID=`grep serial ${myopenaps}/pump.ini | tr -cd 0-9`

[[ -s ${myopenaps}/monitor/medtronic_frequency.ini ]] || die "Unable to find medtronic_frequency.ini file: ${myopenaps}/monitor/medtronic_frequency.ini"
export MEDTRONIC_FREQUENCY=`cat ${myopenaps}/monitor/medtronic_frequency.ini`

send_glucose

