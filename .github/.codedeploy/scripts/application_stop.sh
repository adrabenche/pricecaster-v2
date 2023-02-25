#!/usr/bin/env bash

# stop (or kill) our service
systemctl stop app
# the service has a stop timeout and systemd should kill it, if graceful shutdown fails
# but if systemctl cannot complete its task because, for e.g., someone connected thru SSH
# and wrongly restarted the app manually, try to kill existing instances
pkill -9 ^node
if [ $? -eq 0 ]; then
	echo "UNEXPECTED: running instances terminated by pkill" | logger
fi
