const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const dotenv = require("dotenv");
const fs = require("fs");

// Load environment variables from .env file
const envResult = dotenv.config({ path: path.resolve(__dirname, ".env") });
const env = envResult.parsed || {};

// Create environment variables object for DefinePlugin
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

module.exports = {
  mode: "development",
  entry: "./src/index.jsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    globalObject: "globalThis",
    chunkLoading: "jsonp",
    chunkFormat: "array-push",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader", "postcss-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico)$/i,
        use: [
          {
            loader: "file-loader",
            options: {
              name: "[name].[hash].[ext]",
              outputPath: "assets/images/",
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
    fallback: {
      crypto: require.resolve("crypto-browserify"),
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify"),
      assert: require.resolve("assert"),
      http: require.resolve("stream-http"),
      https: require.resolve("https-browserify"),
      os: require.resolve("os-browserify"),
      url: require.resolve("url"),
      zlib: require.resolve("browserify-zlib"),
      path: require.resolve("path-browserify"),
      process: require.resolve("process/browser.js"),
      fs: false,
      net: false,
      tls: false,
    },
  },
  plugins: [
    { apply(compiler) {
      compiler.hooks.thisCompilation.tap("PdfPreviewAssets", (compilation) => {
        compilation.hooks.processAssets.tap({ name: "PdfPreviewAssets", stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
          const base = path.dirname(require.resolve("pdfjs-dist/package.json"));
          const copy = (folder, output) => {
            for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
              const source = path.join(folder, entry.name), target = output + "/" + entry.name;
              if (entry.isDirectory()) copy(source, target);
              else compilation.emitAsset(target, new webpack.sources.RawSource(fs.readFileSync(source)));
            }
          };
          for (const folder of ["cmaps", "standard_fonts", "wasm"]) copy(path.join(base, folder), "pdf-assets/" + folder);
        });
      });
    } },
    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
    new webpack.DefinePlugin({
      global: "globalThis",
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV || "development"
      ),
      ...envKeys, // Add all environment variables from .env file
    }),
    new webpack.ProvidePlugin({
      process: "process/browser.js",
      Buffer: ["buffer", "Buffer"],
      global: "global",
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 3000,
    hot: true,
  },
  // Renderer UI runs both in Chrome and in Electron; native actions use preload.
  target: "web",
};
