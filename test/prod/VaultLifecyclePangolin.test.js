import { addressBook } from "blockchain-addressbook";
import { chainCallFeeMap } from "../../utils/chainCallFeeMap";
import { web3, ethers } from "hardhat";
import { convertSymbolTokenMapToAddressTokenMap } from "blockchain-addressbook/build/util/convertSymbolTokenMapToAddressTokenMap";
const { expect } = require("chai");

const { zapNativeToToken, getVaultWant, unpauseIfPaused, getUnirouterData } = require("../../utils/testHelpers");
const { delay } = require("../../utils/timeHelpers");

const TIMEOUT = 10 * 60 * 1000000;

const chainName = "avax";
const chainData = addressBook[chainName];
const { beefyfinance } = chainData.platforms;

const myAddress = web3.utils.toChecksumAddress("0xD3425091b74bd097f6d8f194D30229140F814F14");
const secondAddress = web3.utils.toChecksumAddress("0x5EAeA735914bf0766428C85a20429020ba688130");

const config = {
  vault: "0xDdFDB5562438a409156AebE9b7B6a30C1D6f510a",
  vaultContract: "BeefyVaultV6",
  strategyContract: "StrategyPangolinMiniChefLP",
  testAmount: ethers.utils.parseEther("50"),
  wnative: chainData.tokens.WNATIVE.address,
  // keeper: beefyfinance.keeper,
  // strategyOwner: beefyfinance.strategyOwner,
  // vaultOwner: beefyfinance.vaultOwner,

  keeper: myAddress,
  strategyOwner: secondAddress,
  vaultOwner: secondAddress,
};

describe("VaultLifecycleTest", () => {
  let vault, strategy, unirouter, want, deployer, keeper, other;

  beforeEach(async () => {
    [deployer, keeper, other] = await ethers.getSigners();

    vault = await ethers.getContractAt(config.vaultContract, config.vault);
    const strategyAddr = await vault.strategy();
    strategy = await ethers.getContractAt(config.strategyContract, strategyAddr);
    // console.log("Strategy:", strategy);
    // console.log("Strategy Address: ", strategyAddr);

    const unirouterAddr = await strategy.unirouter();

    const unirouterData = {
      interface: "IUniswapRouterAVAX",
      swapSignature: "swapExactAVAXForTokens",
    };
    // const unirouterData = getUnirouterData(unirouterAddr);
    unirouter = await ethers.getContractAt(unirouterData.interface, unirouterAddr);
    want = await getVaultWant(vault, config.wnative);

    await zapNativeToToken({
      amount: config.testAmount,
      want,
      nativeTokenAddr: config.wnative,
      unirouter,
      swapSignature: unirouterData.swapSignature,
      recipient: deployer.address,
    });
    const wantBal = await want.balanceOf(deployer.address);
    await want.transfer(other.address, wantBal.div(2));
  });

  it("User can deposit and withdraw from the vault.", async () => {
    await unpauseIfPaused(strategy, keeper);

    const wantBalStart = await want.balanceOf(deployer.address);
    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();
    await vault.withdrawAll();

    const wantBalFinal = await want.balanceOf(deployer.address);

    expect(wantBalFinal).to.be.lte(wantBalStart);
    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
  }).timeout(TIMEOUT);

  it("Harvests work as expected.", async () => {
    await unpauseIfPaused(strategy, keeper);

    const wantBalStart = await want.balanceOf(deployer.address);
    console.log("Start balance -->", wantBalStart);
    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();

    const vaultBal = await vault.balance();
    const pricePerShare = await vault.getPricePerFullShare();
    await delay(10000);

    const callRewardBeforeHarvest = await strategy.callReward();
    console.log("Call reward -->", callRewardBeforeHarvest);
    expect(callRewardBeforeHarvest).to.be.gt(0);

    console.log("Vault Balance Pre Harvest -->", vaultBal);
    await strategy["harvest()"](); // See issue why has to be called this way here: https://github.com/ethers-io/ethers.js/issues/119
    // await strategy.managerHarvest();
    const vaultBalAfterHarvest = await vault.balance();
    console.log("Vault Balance Post Harvest -->", vaultBalAfterHarvest);
    const pricePerShareAfterHarvest = await vault.getPricePerFullShare();
    //  const callRewardAfterHarvest = await strategy.callReward();

    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);
    console.log("Final Balance -->", wantBalFinal);

    expect(vaultBalAfterHarvest).to.be.gt(vaultBal);
    expect(pricePerShareAfterHarvest).to.be.gt(pricePerShare);
    //  expect(callRewardBeforeHarvest).to.be.gt(callRewardAfterHarvest);

    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));

    const lastHarvest = await strategy.lastHarvest();
    expect(lastHarvest).to.be.gt(0);
  }).timeout(TIMEOUT);

  it("Manager can panic.", async () => {
    await unpauseIfPaused(strategy, keeper);
    const wantBalStart = await want.balanceOf(deployer.address);
    console.log("Vault want balance start -->", wantBalStart);
    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();
    const vaultBal = await vault.balance();
    const balOfPool = await strategy.balanceOfPool();
    const balOfWant = await strategy.balanceOfWant();
    console.log("Strategy want balance -->", balOfWant);
    console.log("Strategy pool balance -->", balOfPool);

    await strategy.connect(keeper).panic();

    const vaultBalAfterPanic = await vault.balance();
    const balOfPoolAfterPanic = await strategy.balanceOfPool();
    const balOfWantAfterPanic = await strategy.balanceOfWant();
    console.log("Strategy want balance post panic -->", balOfWantAfterPanic);
    console.log("Strategy pool balance  post panic -->", balOfPoolAfterPanic);

    expect(vaultBalAfterPanic).to.be.gt(vaultBal.mul(99).div(100));
    expect(balOfPool).to.be.gt(balOfWant);
    expect(balOfWantAfterPanic).to.be.gt(balOfPoolAfterPanic);

    // Users can't deposit.
    const tx = vault.depositAll();
    await expect(tx).to.be.revertedWith("Pausable: paused");

    // User can still withdraw
    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);
    console.log("Vault want balance final -->", wantBalFinal);
    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
  }).timeout(TIMEOUT);

  it("New user deposit/withdrawals don't lower other users balances.", async () => {
    await unpauseIfPaused(strategy, keeper);

    const wantBalStart = await want.balanceOf(deployer.address);
    console.log("Deployer start want balance --> ", wantBalStart);
    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();

    const pricePerShare = await vault.getPricePerFullShare();
    console.log("Initial Price per share", pricePerShare);
    const wantBalOfOther = await want.balanceOf(other.address);
    await want.connect(other).approve(vault.address, wantBalOfOther);
    await vault.connect(other).depositAll();
    const pricePerShareAfterOtherDeposit = await vault.getPricePerFullShare();
    console.log("Price per share post deposit", pricePerShareAfterOtherDeposit);

    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);
    console.log("Deployer want balance final", wantBalFinal);
    const pricePerShareAfterWithdraw = await vault.getPricePerFullShare();
    console.log("Price per share final", pricePerShareAfterWithdraw);

    expect(pricePerShareAfterOtherDeposit).to.be.gte(pricePerShare);
    expect(pricePerShareAfterWithdraw).to.be.gte(pricePerShareAfterOtherDeposit);
    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
  }).timeout(TIMEOUT);

  it("It has the correct owners and keeper.", async () => {
    const vaultOwner = await vault.owner();
    const stratOwner = await strategy.owner();
    const stratKeeper = await strategy.keeper();

    expect(vaultOwner).to.equal(config.vaultOwner);
    expect(stratOwner).to.equal(config.strategyOwner);
    expect(stratKeeper).to.equal(config.keeper);
  }).timeout(TIMEOUT);

  it("Vault and strat references are correct", async () => {
    const stratReference = await vault.strategy();
    const vaultReference = await strategy.vault();

    expect(stratReference).to.equal(ethers.utils.getAddress(strategy.address));
    expect(vaultReference).to.equal(ethers.utils.getAddress(vault.address));
  }).timeout(TIMEOUT);

  it("Manager can set and remove extra reward routes.", async () => {
    await unpauseIfPaused(strategy, keeper);
    await strategy.removeRewardRoute(); // Reset routes before testing

    console.log("After reset");

    console.log("Route before being set");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.rewardToOutputRoute(i);
        console.log(`Token Address ${i} -->`, tokenAddress);
      } catch (err) {}
    }

    console.log("Setting route");
    await strategy.setRewardRoute([
      "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      "0x60781C2586D68229fde47564546784ab3fACA982",
      // "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
    ]);

    console.log("Route after being set");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.rewardToOutputRoute(i);
        console.log(`Token Address ${i} -->`, tokenAddress);
      } catch (err) {}
    }
    expect(await strategy.rewardToOutputRoute(0)).to.equal("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");
    // expect(await strategy.rewardToOutputRoute(1)).to.equal("0xc7198437980c041c805A1EDcbA50c1Ce5db95118");
    expect(await strategy.rewardToOutputRoute(1)).to.equal("0x60781C2586D68229fde47564546784ab3fACA982");

    console.log("Removing Route");
    await strategy.removeRewardRoute();

    console.log("Route after being reset");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.rewardToOutputRoute(i);
        console.log(`Token Address ${i} -->`, tokenAddress);
      } catch (err) {}
    }
    expect(await strategy.rewardToOutputRoute(0)).to.equal("0x0000000000000000000000000000000000000000");
  }).timeout(TIMEOUT);

  it("Displays routing correctly", async () => {
    const { tokenAddressMap } = addressBook[chainName];

    // outputToLp0Route
    console.log("outputToLp0Route:");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.outputToLp0Route(i);
        if (tokenAddress in tokenAddressMap) {
          console.log(tokenAddressMap[tokenAddress]);
        } else {
          console.log(tokenAddress);
        }
      } catch {
        // reached end
        if (i == 0) {
          console.log("No routing, output must be lp0");
        }
        break;
      }
    }

    // outputToLp1Route
    console.log("outputToLp1Route:");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.outputToLp1Route(i);
        if (tokenAddress in tokenAddressMap) {
          console.log(tokenAddressMap[tokenAddress].symbol);
        } else {
          console.log(tokenAddress);
        }
      } catch {
        // reached end
        if (i == 0) {
          console.log("No routing, output must be lp1");
        }
        break;
      }
    }
  }).timeout(TIMEOUT);

  it("Has correct call fee", async () => {
    const callFee = await strategy.callFee();

    const expectedCallFee = chainCallFeeMap[chainName];
    const actualCallFee = parseInt(callFee);

    expect(actualCallFee).to.equal(expectedCallFee);
  }).timeout(TIMEOUT);

  it("has withdraw fee of 0 if harvest on deposit is true", async () => {
    const harvestOnDeposit = await strategy.harvestOnDeposit();
    console.log("Harvest on deposit -->", harvestOnDeposit);
    const withdrawalFee = await strategy.withdrawalFee();
    console.log("Withdraw Fee -->", withdrawalFee);
    const actualWithdrawalFee = parseInt(withdrawalFee);
    if (harvestOnDeposit) {
      expect(actualWithdrawalFee).to.equal(0);
    } else {
      expect(actualWithdrawalFee).not.to.equal(0);
    }
  }).timeout(TIMEOUT);
});
