module.exports = {
  apps : [{
    name   : "Pricecaster Backend",
    script : "npm",
    args :   "run start-production",
  }, 
  {
    name: "Pricecaster Explorer",
    script: "npx",
    args: "serve samples/price-explorer/build -p 3333"
  }]
}
// {
//    name : "Pricecaster Explorer React App",
//    script : "serve",
//    args   : "build -p 3333",
//    cwd    : "samples/price-explorer"}]
//}
