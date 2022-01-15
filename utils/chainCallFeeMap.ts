import { BeefyChain } from "./beefyChain"

const defaultFee = 111;
const reducedFee = 11;

export const chainCallFeeMap: Record<BeefyChain, number> = {
  bsc: defaultFee,
  avax: defaultFee,
  polygon: reducedFee,
  heco: reducedFee,
  fantom: reducedFee,
  one: defaultFee,
  arbitrum: defaultFee,
  moonriver: reducedFee,
  cronos: defaultFee,
  // localhost: reducedFee,
  localhost: defaultFee, // Need to set localhost to match the correct fee for teh network
  celo: reducedFee,
  aurora: reducedFee,
};
