# Lookout

[![Join the chat at https://gitter.im/thebookins/xdrip-js](https://badges.gitter.im/thebookins/xdrip-js.svg)](https://gitter.im/thebookins/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

*Please note this project is neither created nor backed by Dexcom, Inc. This software is not intended for use in therapy.*

## Prerequisites
This project depends on xdrip-js at https://github.com/thebookins/xdrip-js. Following the installation instructions will automatically install xdrip-js; however, xdrip-js has some installation prerequisites that need to be accomplished manually. These steps can be found at https://github.com/thebookins/xdrip-js/wiki.

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

## Start at Boot
When you are comfortable with the Lookout's performance, you can configure the system to start it as a daemon at boot time by adding a line to root's crontab.

To edit root's crontab execute:
```
sudo crontab -e
```

Add the following line:
```
@reboot DEBUG=transmitter Lookout >> /var/log/openaps/xdrip-js.log
```

## Interaction with Dexcom Receiver
YDMV, so test it until you are comfortable. A few people have run Lookout concurrently with their Dexcom receiver without perceiving negative impacts to either.
