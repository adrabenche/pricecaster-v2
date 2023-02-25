#!/usr/bin/env bash
set -o pipefail

# import variables created in GitHub Action
source /tmp/env/vars
VARS=$(cat /tmp/env/vars)
rm /tmp/env/vars

# get public key certificate for instance identification
IDENTITY_TOKEN=$(curl -f -s -X PUT -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" "http://169.254.169.254/latest/api/token")
if [ $? -ne 0 ] || [ -z "$IDENTITY_TOKEN" ]; then echo "Error: Unable to get token for instance identification"; exit 1; fi

PKCS7=$(curl -f -s -H "X-aws-ec2-metadata-token: $IDENTITY_TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/rsa2048 | tr -d '\n')
if [ $? -ne 0 ] || [ -z "$PKCS7" ]; then echo "Error: Unable to get certificate for instance identification"; exit 1; fi

# setup Vault variables
if [ "$AMBIENT" = "dev" ]; then
	VAULT_ADDR="https://dev-vault.c3.io"
elif [ "$AMBIENT" = "staging" ]; then
	VAULT_ADDR="https://staging-vault.c3.io"
elif [ "$AMBIENT" = "prod" ]; then
	VAULT_ADDR="https://vault.c3.io"
else
	echo "Error: Invalid ambient specified"
	exit 1
fi
VAULT_ROLE="beta-price-caster-ro"
VAULT_SECRETS_LOCATION="beta-price-caster/v1"

# create payload for login using the NONCE value if previously used
if [ -s /root/nonce ]; then
	NONCE=$(cat /root/nonce)
	PAYLOAD=$(cat <<EOF
{
	"role": "$VAULT_ROLE",
	"pkcs7": "$PKCS7",
	"nonce": "$NONCE"
}
EOF
)
else
	PAYLOAD=$(cat <<EOF
{
	"role": "$VAULT_ROLE",
	"pkcs7": "$PKCS7"
}
EOF
)
fi

# login into Vault
LOGIN_RESPONSE=$(curl -f -s -X POST --data "$PAYLOAD" ${VAULT_ADDR}/v1/auth/aws-ro/login)
if [ $? -ne 0 ] || [ -z "$LOGIN_RESPONSE" ]; then echo "Error: Unable to login into Vault"; exit 1; fi

# get vault client token
VAULT_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.auth | select(.client_token != null).client_token')
if [ -z $VAULT_TOKEN ] || [ "$VAULT_TOKEN" == "null" ]; then echo "Error: Missing client token in Vault response"; exit 1; fi

# check if a NONCE was returned and save it
NONCE=$(echo $LOGIN_RESPONSE | jq -r '.auth.metadata | select(.nonce != null).nonce')
if [ -n "$NONCE" ]; then echo $NONCE > /root/nonce; fi

# retrieve application settings from Vault (the whole JSON)
SETTINGS=$(curl -f -s -H "X-Vault-Token: $VAULT_TOKEN" ${VAULT_ADDR}/v1/secrets/${VAULT_SECRETS_LOCATION} | jq -r '.data')
if [ $? -ne 0 ] || [ -z "$SETTINGS" ] || [ "$SETTINGS" == "null" ]; then echo "Error: Unable to get application settings from Vault"; exit 1; fi

# escape quotes and remove new lines
#SETTINGS=$(echo $SETTINGS | sed 's/"/\\"/g' | sed 's/[\n\r]//g')
#echo $SETTINGS                  > /root/env

# create environment variables file
echo $SETTINGS | jq -r "to_entries|map(\"\(.key)=\(.value|tostring)\")|.[]" > /root/env
echo "COMMIT_HASH=$COMMIT_HASH" >> /root/env
echo "AMBIENT=$AMBIENT"         >> /root/env
echo "AMBIENT=$AMBIENT"         >> /root/env

echo "STORAGE_DB=./db/pricecaster.db" >> /root/env

# change the user/group of the app directory to nobody user
chown -R nobody: /arena

# restart systemd daemon to refresh services list
systemctl daemon-reload
[ $? -eq 0 ] || { echo "Error: Unable to restart systemd"; exit 1; }

# enable our service
systemctl enable app.service
[ $? -eq 0 ] || { echo "Error: Unable to enable service"; exit 1; }
