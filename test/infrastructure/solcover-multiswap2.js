module.exports = {
  skipFiles: [
    'third_party',
    'test',
    'swap',
    'tools',
    'loan',
    'base',
    // 'infrastructure',
      'infrastructure\\liquidity',
      'infrastructure\\price',
      'infrastructure\\reward',
      'infrastructure\\salary',
      'infrastructure\\zap\\',
      'infrastructure\\zap2\\IDepositHelper.sol',
      'infrastructure\\zap2\\IMultiSwap2.sol',
      'infrastructure\\zap2\\IZapContract2.sol',
    'strategies',
    'openzeppelin',
  ]
};
