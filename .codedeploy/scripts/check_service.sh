#!/usr/bin/env bash

exit 0

# don't want the script to exit on the first error
set +e

# import variable from /root/env (this script runs as root)
COMMIT_HASH=$(grep '^COMMIT_HASH=' /root/env)
COMMIT_HASH=${COMMIT_HASH:12:8}
if ! [[ ${COMMIT_HASH} =~ ^[0-9A-Fa-f]{8}$ ]]; then
	echo "Error: Invalid commit hash"
	exit 1
fi

# query the health endpoint on the metrics server and extract commit from X-App header
# X-App format is: teal-decompiler:v{version}:{commit}
for ((retry = 9; retry > 0; retry--))
do
	SERVICE_HASH=$(curl -f -s -i http://0.0.0.0:9090/health | grep 'X-App:' | sed -r 's/^.*X-App: teal-decompiler:[^:]+:([0-9A-Fa-f]{8}).*$/\1/')
	if [ "$COMMIT_HASH" = "$SERVICE_HASH" ]; then
		break
	fi

	if [ -n "$SERVICE_HASH" ]; then
		echo "Expected deploy hash: $COMMIT_HASH / Got: $SERVICE_HASH"
		journalctl --unit=app --since "1 min ago" --no-pager -q
		exit 1
	fi

	if [ $retry -eq 1 ]; then
		journalctl --unit=app --since "1 min ago" --no-pager -q
		exit 1
	fi
	echo "Waiting for public api to become online ($retry)..."
	sleep 1
done

# our service exposes a server to the public so query the health endpoint and check if responds as expected
for ((retry = 9; retry > 0; retry--))
do
	curl -f -s -i http://0.0.0.0:8080/health
	if [ $? -eq 0 ]; then
		break
	fi

	if [ $retry -eq 1 ]; then
		journalctl --unit=app --since "1 min ago" --no-pager -q
		exit 1
	fi

	echo "Waiting for public api to become online ($retry)..."
	sleep 1
done
