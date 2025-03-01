const path = require('path');
const { merge } = require('webpack-merge');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const common = require('./webpack.common.js');

const devConfig = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    main: './src/index.tsx'
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    port: 3030,
    hot: true,
    open: true,
    historyApiFallback: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      chunks: ['main']
    })
  ],
  watch: true
};

module.exports = merge(common, devConfig);