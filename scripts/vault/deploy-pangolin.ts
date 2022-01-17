import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { predictAddresses } from "../../utils/predictAddresses";
import { setCorrectCallFee } from "../../utils/setCorrectCallFee";
// import { setPendingRewardsFunctionName } from "../../utils/setPendingRewardsFunctionName";
import { verifyContract } from "../../utils/verifyContract";
import { BeefyChain } from "../../utils/beefyChain";

const registerSubsidy = require("../../utils/registerSubsidy");

const {
  platforms: { pangolin, beefyfinance },
  tokens: {
    PNG: { address: PNG },
    AVAX: { address: AVAX },
    USDCe: { address: USDCe },
    USDTe: { address: USDTe },
  },
} = addressBook.avax;

const want = web3.utils.toChecksumAddress("0xc13E562d92F7527c4389Cd29C67DaBb0667863eA");
const minichef = web3.utils.toChecksumAddress("0x1f806f7C8dED893fd3caE279191ad7Aa3798E928");

const vaultParams = {
  mooName: "Moo PangolinV2 USDC.e-USDT.e",
  mooSymbol: "mooPangolinV2USDC.e-USDT.e",
  delay: 21600,
};

const shouldVerifyOnEtherscan = false;

const strategyParams = {
  want,
  poolId: 2,
  outputToNativeRoute: [PNG, AVAX],
  outputToLp0Route: [PNG, USDCe],
  outputToLp1Route: [PNG, USDCe, USDTe],
  rewardToOutputRoute: [],
  chef: minichef,
  unirouter: pangolin.router,
  strategist: "0x5EAeA735914bf0766428C85a20429020ba688130", // some address
  // keeper: beefyfinance.keeper,
  keeper: "0xD3425091b74bd097f6d8f194D30229140F814F14",
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  // pendingRewardsFunctionName: "pendingReward", // used for rewardsAvailable(), use correct function name from masterchef
};

const contractNames = {
  vault: "BeefyVaultV6",
  strategy: "StrategyPangolinMiniChefLP",
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
  const vault = await Vault.deploy(...vaultConstructorArguments);
  await vault.deployed();

  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.poolId,
    strategyParams.chef,
    vault.address,
    strategyParams.unirouter,
    strategyParams.keeper,
    strategyParams.strategist,
    strategyParams.beefyFeeRecipient,
    strategyParams.outputToNativeRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route,
    strategyParams.rewardToOutputRoute,
  ];

  const strategy = await Strategy.deploy(...strategyConstructorArguments);
  await strategy.deployed();
  // add this info to PR
  console.log();
  console.log("Vault:", vault.address);
  console.log("Strategy:", strategy.address);
  console.log("Want:", strategyParams.want);
  console.log("PoolId:", strategyParams.poolId);

  console.log();

  const verifyContractsPromises: Promise<any>[] = [];
  if (shouldVerifyOnEtherscan) {
    // skip await as this is a long running operation, and you can do other stuff to prepare vault while this finishes
    verifyContractsPromises.push(
      verifyContract(vault.address, vaultConstructorArguments),
      verifyContract(strategy.address, strategyConstructorArguments)
    );
  }
  // await setPendingRewardsFunctionName(strategy, strategyParams.pendingRewardsFunctionName);
  await setCorrectCallFee(strategy, hardhat.network.name as BeefyChain);
  console.log();

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
