# Lookout

[![Join the chat at https://gitter.im/thebookins/xdrip-js](https://badges.gitter.im/thebookins/xdrip-js.svg)](https://gitter.im/thebookins/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

*Please note this project is neither created nor backed by Dexcom, Inc. This software is not intended for use in therapy.*

## Overview
Lookout provides a rig-based interface to a Dexcom G5 CGM using Bluetooth Low Energy (BLE).  Lookout connects to the G5 transmitter and provides the following capabilities:
- start and stop sensor sessions
- view reported glucose values
- send glucose values to OpenAPS and Nightscout
- send finger stick calibration values to the transmitter
- reset expired transmitters
- calculate and report trend and noise values
- calculate and report G5 calibration slope and offset values
- report BG Check records to Nightscout obtained from transmitter's G5 calibration events
- report sensor state changes to Nightscout as announcements
- extend sensor operation beyond sensor expiration (limitations described below)
- report raw unfiltered values to Nightscout during warmup for trend visibility

Lookout is intended for use with the unexpired G5 transmitters and relies on the official G5 calibration built into the transmitter to calibrate the raw sensor values.  Lookout provides the user with the ability to reset expired transmitters allowing them to be used past their normal expiration dates.

Lookout can be run in parallel with a Dexcom receiver.  However, it cannot run in parallel with a Dexcom or xDrip app on a phone as only one of the devices will connect to a transmitter at a time. Swapping devices requires approximately 15 minutes of the transmitter being unable to communicate with the device it was talking with before it will begin to talk to a new device.

## Pre-installation
You must update your rig's NodeJS based on https://github.com/xdrip-js/xdrip-js/wiki (only use the "Updating NodeJS" section of those instructions, you should not install xdrip-js manually, it will be installed in the next step as part of Lookout.)
As of 13-Jun-2018, these steps are:
```
The version of Node that ships with jubilinux is old (v0.10.something). Lookout requires version 8 or later. Here are the instructions for updating Node:

sudo apt-get remove nodered -y
sudo apt-get remove nodejs nodejs-legacy -y
sudo apt-get remove npm  -y # if you installed npm
sudo curl -sL https://deb.nodesource.com/setup_8.x | sudo bash -
sudo apt-get install nodejs -y
```
If you later need to revert your rig's NodeJS to the legacy version, follow the steps in the below section "Reverting NodeJS".

Lookout uses the bluez-tools software. Here are the instructions for installing bluez-tools:

```
sudo apt-get install bluez-tools
```


## Installation
```
cd ~
git clone https://github.com/xdrip-js/Lookout.git
cd Lookout
sudo npm install
sudo npm link
```
## Testing
```
npm test
```

## Updating Your Rig
```
cd ~/Lookout
git remote remove upstream # Just in case one already exists - this command may error, but that is OK
git remote add upstream https://github.com/xdrip-js/Lookout.git
git checkout master
git merge upstream/master
git push
sudo npm install
sudo npm link
```

If you want to run the dev branch, replace `master` in the commands above with `dev`.  If your upstream is already set to the xdrip-js repository, you can skip the `git remote` commands.  The current git remote repositories can be displayed with the `git remote -v` command.

## Example usage
Just type `Lookout`. The app will run on port 3000.

To see verbose output, use `sudo DEBUG=* Lookout`, and replace the `*` with a comma separated list of the modules you would like to debug. E.g. `sudo DEBUG=smp,transmitter,bluetooth-manager Lookout`.

To run in simulated mode, use `node index.js --sim`.

To view the app, open a browser and navigate to `http://<local IP address>:3000`. E.g. http://localhost:3000 or http://192.168.1.3:3000. This will vary depending on your local network setup.

![app](images/home.png)

## Using the browser to control your G5
Once the browser is open to your Lookout page (see above steps), you can start the sensor and calibrate through it. (Note that you can also continue using the Dexcom receiver alongside Lookout to do these things as well. Both the receiver and Lookout will get the latest updates from the G5 transmitter after a reading or two, provided they are in range and connected.)

* click "Menu" (bottom right button) on the Lookout page, then `CGM` and `Transmitter`, then `Pair new`, and enter your transmitter ID (note it is case-sensitive), then `Save`
* put the sensor/transmitter on your body, if you haven't already, and press the "Home"/person button at the bottom left of the lookout page, then click `Start sensor` (this part is identical to the receiver, which you can also use at the same time, alternatively, to start the sensor).
* wait 5 minutes and press the `Menu` button, then `CGM` and `Sensor`, the `State` should show as `Warmup`. Press the "Home" screen (bottom left, person button), you will also see this state here after a while.
* after 2 hours the state will change to `First calibration` - enter the first calibration by clicking the `Calibration` button and entering the value from a finger stick.
* after 5 minutes the state will change to `Second calibration` - enter the second calibration by clicking the `Calibration` button and entering the value from a finger stick.
* after 5 minutes the state will change to `OK` and dexcom-calibrated BG values will be displayed.

**NOTE** There is a second button on the "Home" screen, Start sensor 2 hours ago, that can be used to send a start message backdated by 2 hours.  This allows the user to pre-soak a sensor while the ongoing session continues.  When the ongoing session ends, move the transmitter to the new sensor and use the "Start sensor 2 hours ago" button to start the new session.  This will normally provide the user with a First calibration request within 5 to 10 minutes instead of 2 hours of down time.

## Nightscout CGM Status Pill
This feature requires Nightscout 0.10.3 or later. Lookout provides devicestatus records to Nightscout which will display the CGM status in a CGM pill if the Nightscout xdrip-js plugin is enabled. See the Nightscout README for details on enabling the plugin and settings.

## Reset a Transmitter
* Ensure the transmitter ID is entered as described above.
* Ensure the transmitter is not currently in a sensor session. Stop session if necessary.
* Click "Menu" on the Lookout page, then `CGM` and `Transmitter`, then `Reset Transmitter`, then `Reset`
* wait 5 minutes and press the "Menu" button, then `CGM` and `Transmitter`, the `Age` should show as less than a day.
* After successfully resetting the transmitter, follow the instructions above to start a sensor session.

## Making it permanent
So far in the above you've only run Lookout from the command line - the next time you close your terminal, or reboot your rig, it will only run if you add it to your crontab:
```
<type the command `crontab -e` and add this line:>
@reboot Lookout >> /var/log/openaps/xdrip-js.log
<save and exit your editor>
<reboot your rig with the command `reboot`>
```

## Debugging
To look at the Lookout log, for debug purposes, type `cat /var/log/openaps/xdrip-js.log` or `tail -n 100 -F /var/log/openaps/xdrip-js.log`.

## Options
* `--extend_sensor`: Lookout uses the calibrated and unfiltered values reported by the G5 to calculate the running calibration slope and intercept values whenever the current calibration values it has produces a calibrated value that is more than 5 mg/dL away from the G5 reported calibrated value.  If the `--extend_sensor` option is enabled, Lookout will apply the most recent calculated calibration to the G5's unfiltered value if the transmitter does not report a calibrated SGV.  This enables Lookout to continue reporting SGV values to Nightscout and OpenAPS after the sensor session is ended, providing greater flexibility on when the user changes the site.  This is not intended to extend a sensor life past 24 hours due to the lack of an ongoing calibration update mechanism.

**WARNING** If running in extended sensor mode, the user must enter a `Sensor Start` in Nightscout to notify Lookout to stop reporting glucose values.

## Reverting NodeJS

in the future if you decide you do not want to use xdrip-js, or you are having trouble updating OpenAPS with the nodejs update, you can revert the nodejs install with:
```
sudo apt-get remove nodered -y
sudo apt-get remove nodejs nodejs-legacy -y
sudo apt-get remove npm -y
sudo aptitude install nodejs-legacy
<say no to the first prompt about keeping nodejs-legacy at current version, say yes to the 2nd prompt about installing nodejs 'oldstable' version>
```

## Interaction with Dexcom Receiver
YDMV, so test it until you are comfortable. A few people have run Lookout concurrently with their Dexcom receiver without perceiving negative impacts to either.
