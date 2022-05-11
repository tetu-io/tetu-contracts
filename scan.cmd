@echo off
rem To use this script, firstly do:
rem npm install -g @owodunni/ethscan

rem add your scan key to env variables outside this file
rem SET ETHSCAN_KEY=

SET ETHSCAN_URL=https://api.polygonscan.com
IF "%~2"=="main" (
SET ETHSCAN_URL=
)
IF "%~2"=="fantom" (
SET ETHSCAN_URL=https://fantomscan.com // !!!!  NOT TESTED YET
)
IF "%~2"=="bsc" (
SET ETHSCAN_URL=https://bscscan.com // !!!!  NOT TESTED YET
)

IF "%~1"=="" (
ECHO "Usage: scan <contract_address> [main|fantom|bsc|matic]"
ECHO "Contracts sources will be saved to ./tmp/<address> folder"
ECHO "Polygon (matic) network used by default"
ECHO "Ex: scan 0x255707b70bf90aa112006e1b07b9aea6de021424"
ECHO
REM Install the ethscan tool
npm install -g @owodunni/ethscan

) ELSE (

CALL ethscan code %1 -o ./tmp/%1

)
