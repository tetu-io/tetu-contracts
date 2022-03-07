rem Call this script from the project root
hardhat.cmd coverage --testfiles "test/strategies/matic/multi-aave-mai-bal/*.ts" --solcoverjs ./test/strategies/matic/multi-aave-mai-bal/.solcover.js --temp artifacts --max-memory 4096
