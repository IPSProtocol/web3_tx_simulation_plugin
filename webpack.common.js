const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const commonConfig = {
  entry: {
    popup: './src/popup/index.tsx',
    contentScript: './src/contentScript/index.tsx',
    background: './src/background/index.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: false,
              compilerOptions: {
                module: 'esnext',
                moduleResolution: 'node',
                noImplicitAny: true,
                removeComments: false,
                preserveConstEnums: true,
                sourceMap: true,
                strict: true
              }
            }
          }
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[name][ext]'
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
    assetModuleFilename: 'assets/[name][ext]'
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { 
          from: 'public',
          globOptions: {
            ignore: ['**/index.html', '**/popup.html']
          }
        }
      ]
    })
  ]
};

module.exports = commonConfig;