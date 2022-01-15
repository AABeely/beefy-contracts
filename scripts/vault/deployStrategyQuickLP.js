import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { predictAddresses } from "../../utils/predictAddresses";
import { setCorrectCallFee } from "../../utils/setCorrectCallFee";
import { verifyContract } from "../../utils/verifyContract";
import { BeefyChain } from "../../utils/beefyChain";

const registerSubsidy = require("../../utils/registerSubsidy");

// Below outputs the token and contract addresses.
// Saves them to the variables highlighted in red.
const {
  platforms: { quickswap, beefyfinance },
  tokens: {
    DAI: { address: DAI },
    QUICK: { address: QUICK },
    MATIC: { address: MATIC },
    ETH: { address: ETH },
  },
} = addressBook.polygon;

// As GNS is not currently within the address book I will deploy it using the address here
const GNS = web3.utils.toChecksumAddress("0xE5417Af564e4bFDA1c483642db72007871397896");

const shouldVerifyOnEtherscan = false;

// Quickswap reward pool
const rewardPool = web3.utils.toChecksumAddress("0x33025b177A35F6275b78f9c25684273fc24B4e43");

// Used to create the Beefy Vault Contract
const vaultParams = {
  mooName: "Moo Quick-GNS-DAI",
  mooSymbol: "mooQuickGnsDai",
  delay: 21600,
};

// Used to create the Vault Strategy
const strategyParams = {
  want: "0x6e53cb6942e518376e9e763554db1a45ddcd25c4", // LP token pool
  rewardPool: rewardPool, // LP Farm / Reward pool
  unirouter: quickswap.router, // Router
  strategist: "0x5EAeA735914bf0766428C85a20429020ba688130", // my address
  // keeper: beefyfinance.keeper, // Address of keeper (Able to panic / pause / unpause vaults)
  keeper: "0xD3425091b74bd097f6d8f194D30229140F814F14",
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  outputToNativeRoute: [QUICK, MATIC],
  outputToLp0Route: [QUICK, ETH, DAI],
  outputToLp1Route: [QUICK, ETH, DAI, GNS],
};

const contractNames = {
  vault: "BeefyVaultV6",
  strategy: "StrategyPolygonQuickLP",
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
  console.log(predictAddresses);

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
    strategyParams.rewardPool,
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
  console.log("Keeper:", strategy.keeper);
  console.log("Want:", strategyParams.want);
  console.log("RewardPool:", strategyParams.rewardPool);

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
