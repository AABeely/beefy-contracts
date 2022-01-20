import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { predictAddresses } from "../../utils/predictAddresses";
import { setCorrectCallFee } from "../../utils/setCorrectCallFee";
import { verifyContract } from "../../utils/verifyContract";
import { BeefyChain } from "../../utils/beefyChain";

const registerSubsidy = require("../../utils/registerSubsidy");

const {
  platforms: { beefyfinance, quickswap, sushi },
  tokens: {
    MATIC: { address: MATIC },
    ETH: { address: ETH },
  },
} = addressBook.polygon;

// const GENESIS = web3.utils.toChecksumAddress("0x51869836681bce74a514625c856afb697a013797");
// const FODL = web3.utils.toChecksumAddress("0x5314bA045a459f63906Aa7C76d9F337DcB7d6995");
const ICE = web3.utils.toChecksumAddress("0x4e1581f01046eFDd7a1a2CDB0F82cdd7F71F2E59");

const changeableParams = {
  mooName: "Moo Popsicle ICE-WETH",
  mooSymbol: "mooPopsicleICE-WETH",
  want: web3.utils.toChecksumAddress("0x941eb28e750C441AEF465a89E43DDfec2561830b"),
  poolId: 0,
  chef: web3.utils.toChecksumAddress("0xbf513aCe2AbDc69D38eE847EFFDaa1901808c31c"),
  // rewardPool: web3.utils.toChecksumAddress("0x3620418dD43853c35fF8Df90cAb5508FB5df46Bf"),
  outputToNativeRoute: [ICE, ETH, MATIC],
  // rewardToNativeRoute: [],
  outputToLp0Route: [ICE],
  outputToLp1Route: [ICE, ETH],
  // nativeToLp0Route: [],
  // nativeToLp1Route: [],
  strategyName: "StrategyCommonChefLP",
  router: sushi.router,
  deployToProd: true,
  shouldHarvestOnDeposit: true,
};

// Currently Broken
// const changeableParams = {
//   mooName: "Moo Quick MATIC-FODL",
//   mooSymbol: "mooQuickMATIC-FODL",
//   want: web3.utils.toChecksumAddress("0x2Fc4DFCEe8C331D54341f5668a6d9BCdd86F8e2f"),
//   rewardPool: web3.utils.toChecksumAddress("0x3620418dD43853c35fF8Df90cAb5508FB5df46Bf"),
//   outputToNativeRoute: [QUICK, MATIC],
//   rewardToNativeRoute: [FODL, USDC, MATIC],
//   nativeToLp0Route: [MATIC],
//   nativeToLp1Route: [MATIC, FODL],
//   strategyName: "StrategyQuickswapDualRewardLP",
//   router: quickswap.router,
//   deployToProd: false,
//   shouldHarvestOnDeposit: true,
// };

// const changeableParams = {
//   mooName: "Moo Quick QUICK-GENESIS",
//   mooSymbol: "mooQuickQUICK-GENESIS",
//   want: web3.utils.toChecksumAddress("0xF0696be85fa54F7a8C9F20AA98aA4409CD5C9D1B"),
//   rewardPool: web3.utils.toChecksumAddress("0x3620418dD43853c35fF8Df90cAb5508FB5df46Bf"),
//   outputToNativeRoute: [QUICK, MATIC],
//   rewardToNativeRoute: [GENESIS, QUICK, MATIC],
//   nativeToLp0Route: [MATIC, QUICK, GENESIS],
//   nativeToLp1Route: [MATIC, QUICK],
//   strategyName: "StrategyQuickswapDualRewardLP",
//   router: quickswap.router,
//   deployToProd: false,
// };

const shouldVerifyOnEtherscan = changeableParams.deployToProd;

const vaultParams = {
  mooName: changeableParams.mooName,
  mooSymbol: changeableParams.mooSymbol,
  delay: 21600,
};

// Used to create the Vault Strategy
const strategyParams = {
  want: changeableParams.want,
  // rewardPool: changeableParams.rewardPool,
  unirouter: changeableParams.router,
  strategist: "0x5EAeA735914bf0766428C85a20429020ba688130", // my address
  keeper: changeableParams.deployToProd ? beefyfinance.keeper : "0xD3425091b74bd097f6d8f194D30229140F814F14", // Address of keeper (Able to panic / pause / unpause vaults)
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  outputToNativeRoute: changeableParams.outputToNativeRoute,
  outputToLp0Route: changeableParams.outputToLp0Route,
  outputToLp1Route: changeableParams.outputToLp1Route,
  // rewardToNativeRoute: changeableParams.rewardToNativeRoute,
  // nativeToLp0Route: changeableParams.nativeToLp0Route,
  // nativeToLp1Route: changeableParams.nativeToLp1Route,
};

const contractNames = {
  vault: "BeefyVaultV6",
  strategy: changeableParams.strategyName,
};

async function main() {
  if (
    Object.values(vaultParams).some(v => v === undefined) ||
    Object.values(strategyParams).some(v => v === undefined) ||
    Object.values(contractNames).some(v => v === undefined)
  ) {
    console.error("one of config values undefined");
    return;
  }

  await hardhat.run("compile");

  // Retrives both of the defined contracts
  const Vault = await ethers.getContractFactory(contractNames.vault);
  const Strategy = await ethers.getContractFactory(contractNames.strategy);

  const [deployer] = await ethers.getSigners();

  console.log("Deploying:", vaultParams.mooName);

  const predictedAddresses = await predictAddresses({ creator: deployer.address });

  const vaultConstructorArguments = [
    predictedAddresses.strategy,
    vaultParams.mooName,
    vaultParams.mooSymbol,
    vaultParams.delay,
  ];

  // Deploys the vault contract
  const vault = await Vault.deploy(...vaultConstructorArguments);
  await vault.deployed();

  const strategyConstructorArguments = [
    strategyParams.want,
    changeableParams.poolId,
    changeableParams.chef,
    vault.address,
    strategyParams.unirouter,
    strategyParams.keeper,
    strategyParams.strategist,
    strategyParams.beefyFeeRecipient,
    strategyParams.outputToNativeRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route,
  ];
  const strategy = await Strategy.deploy(...strategyConstructorArguments);
  await strategy.deployed();

  // add this info to PR
  console.log();
  console.log("Vault:", vault.address);
  console.log("Strategy:", strategy.address);
  console.log("Want:", strategyParams.want);
  console.log();
  console.log("Running post deployment");

  const verifyContractsPromises = [];
  if (shouldVerifyOnEtherscan) {
    // skip await as this is a long running operation, and you can do other stuff to prepare vault while this finishes
    verifyContractsPromises.push(
      verifyContract(vault.address, vaultConstructorArguments),
      verifyContract(strategy.address, strategyConstructorArguments)
    );
  }
  await setCorrectCallFee(strategy, hardhat.network.name);
  console.log();
  if (changeableParams.shouldHarvestOnDeposit) {
    console.log(`Setting harvest on deposit: ${changeableParams.shouldHarvestOnDeposit}`);
    await strategy.setHarvestOnDeposit(changeableParams.shouldHarvestOnDeposit);
  }

  await Promise.all(verifyContractsPromises);

  if (hardhat.network.name === "bsc") {
    await registerSubsidy(vault.address, deployer);
    await registerSubsidy(strategy.address, deployer);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
