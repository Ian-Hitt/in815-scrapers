import { runSnapScraper } from "./snap.js";

runSnapScraper({
  schoolName: "Rockford Lutheran High School",
  organizationId: "rl",
  homeAddress: { address: "3333 N Alpine Rd", city: "Rockford", state: "IL", zip: "61114" },
  outputFile: "../data/rl.csv",
}).catch(console.error);
