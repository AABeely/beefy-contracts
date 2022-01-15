import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { verifyContract } from "../../utils/verifyContract";

const registerSubsidy = require("../../utils/registerSubsidy");

const {
  platforms: { pangolin, beefyfinance },
  tokens: {
    PNG: { address: PNG },
    AVAX: { address: AVAX },
  },
} = addressBook.avax;

const want = web3.utils.toChecksumAddress("0xd7538cabbf8605bde1f4901b47b8d42c61de0367");
const minichef = web3.utils.toChecksumAddress("0x1f806f7C8dED893fd3caE279191ad7Aa3798E928");

const vaultParams = {
  mooName: "Moo PangolinV2 PNG-AVAX",
  mooSymbol: "mooPangolinV2PNG-AVAX",
  delay: 21600,
};

const strategyAddress = "0xa7531bFE23796ba6cE5192Ecd3889A337B44dE21";
const vaultAddress = "0xEDAF873002c512C47d6688985C7DC4D64A629697";

const strategyParams = {
  want,
  poolId: 0,
  chef: minichef,
  unirouter: pangolin.router,
  strategist: "0x5EAeA735914bf0766428C85a20429020ba688130",
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  outputToNativeRoute: [PNG, AVAX],
  outputToLp0Route: [PNG],
  outputToLp1Route: [PNG, AVAX],
};

async function main() {
  const vaultConstructorArguments = [strategyAddress, vaultParams.mooName, vaultParams.mooSymbol, vaultParams.delay];
  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.poolId,
    strategyParams.chef,
    vaultAddress,
    strategyParams.unirouter,
    strategyParams.keeper,
    strategyParams.strategist,
    strategyParams.beefyFeeRecipient,
    strategyParams.outputToNativeRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route,
  ];

  const verifyContractsPromises: Promise<any>[] = [];
  verifyContractsPromises.push(
    verifyContract(vaultAddress, vaultConstructorArguments),
    verifyContract(strategyAddress, strategyConstructorArguments)
  );

  await Promise.all(verifyContractsPromises);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
