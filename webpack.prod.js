const { merge } = require('webpack-merge');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const common = require('./webpack.common.js');

const prodConfig = {
  mode: 'production',
  devtool: 'source-map',
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'popup.html',
      chunks: ['popup']
    })
  ]
};

module.exports = merge(common, prodConfig); 