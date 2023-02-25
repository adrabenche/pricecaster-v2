#!/usr/bin/env bash
set -o pipefail

# start our service
systemctl start app
exit $?
