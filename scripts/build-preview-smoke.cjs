const path = require("node:path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { spawn } = require("node:child_process");
const base = require("../webpack.config.js");
const output = path.resolve(__dirname, "../.preview-smoke");
const config = { ...base, mode: "production", entry: path.join(__dirname, "preview-smoke-harness.jsx"),
  output: { ...base.output, path: output },
  optimization: { minimize: false },
  plugins: [...base.plugins.filter((plugin) => !(plugin instanceof HtmlWebpackPlugin)),
    new webpack.DefinePlugin({ __PREVIEW_FIXTURE__: JSON.stringify(require("./preview-fixture.cjs")().toString("base64")) }),
    new webpack.NormalModuleReplacementPlugin(/services[\\/]attachmentService$/, path.join(__dirname, "preview-smoke-service.jsx")),
    new HtmlWebpackPlugin({ templateContent: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>' }),
  ],
};
webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
  console.log("Built preview integration harness");
  const child = spawn(require("electron"), [path.join(__dirname, "preview-smoke.cjs")], { stdio: "inherit", windowsHide: true });
  child.on("exit", (code) => {
    if (code) { process.exitCode = code; return; }
    const browser = spawn(process.execPath, [path.join(__dirname, "preview-browser-smoke.cjs")], { stdio: "inherit", windowsHide: true });
    browser.on("exit", (result) => { process.exitCode = result || 0; });
  });
});
