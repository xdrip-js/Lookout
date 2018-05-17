# Lookout

[![Join the chat at https://gitter.im/thebookins/xdrip-js](https://badges.gitter.im/thebookins/xdrip-js.svg)](https://gitter.im/thebookins/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

*Please note this project is neither created nor backed by Dexcom, Inc. This software is not intended for use in therapy.*

## Pre-installation
You must update your rig's NodeJS based on https://github.com/thebookins/xdrip-js/wiki (only use the "Updating NodeJS" section of those instructions, you should not install xdrip-js manually, it will be installed in the next step as part of Lookout.)
As of 14-Jan-2018, these steps are:
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

sudo apt-get install bluez-tools


## Installation
```
git clone https://github.com/thebookins/Lookout.git
cd Lookout
sudo npm install
sudo npm link
```
## Testing
```
npm test
```

## Example usage
Just type `Lookout`. The app will run on port 3000.

To see verbose output, use `sudo DEBUG=* Lookout`, and replace the `*` with a comma separated list of the modules you would like to debug. E.g. `sudo DEBUG=smp,transmitter,bluetooth-manager Lookout`.

To run in simulated mode, use `node index.js --sim`.

To view the app, open a browser and navigate to `http://<local IP address>:3000`. E.g. http://localhost:3000 or http://192.168.1.3:3000. This will vary depending on your local network setup.
![app](https://user-images.githubusercontent.com/12263040/29741914-36d4bfe4-8ab9-11e7-891e-6c23263db499.png)

## Using the browser to control your G5
Once the browser is open to your Lookout page (see above steps), you can start the sensor and calibrate through it. (Note that you can also continue using the Dexcom receiver alongside Lookout to do these things as well. Both the receiver and Lookout will get the latest updates from the G5 transmitter after a reading or two, provided they are in range and connected.)

* click "Menu" (bottom right button) on the Lookout page, then "CGM" and "Transmitter", then "Pair new", and enter your transmitter ID (note it is case-sensitive), then "Save"
* put the sensor/transmitter on your body, if you haven't already, and press the "Home"/person button at the bottom left of the lookout page, then click "Start sensor" (this part is identical to the receiver, which you can also use at the same time, alternatively, to start the sensor).
* wait 5 minutes and press the "Menu" button, then "CGM" and "Sensor", the "State" should show as "Warmup". Press the "Home" screen (bottom left, person button), you will also see this state here after a while.
* after 2 hours the state will change to "First calibration" - enter the first calibration by clicking the "Calibration" button and entering the value from a finger stick.
* after 5 minutes the state will change to "Second calibration" - enter the second calibration by clicking the "Calibration" button and entering the value from a finger stick.
* after 5 minutes the state will change to "OK" and dexcom-calibrated BG values will be displayed.

## Making it permanent
So far in the above you've only run Lookout from the command line - the next time you close your terminal, or reboot your rig, it will only run if you add it to your crontab:
```
<type the command "crontab -e" (without quotes) and add this line:>
@reboot Lookout >> /var/log/openaps/xdrip-js.log
<save and exit your editor>
<reboot your rig with the command "reboot" (without quotes)>
```

## Debugging
To look at the Lookout log, for debug purposes, type "cat /var/log/openaps/xdrip-js.log" or "tail -n 100 -F /var/log/openaps/xdrip-js.log" (without the quotes).

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
