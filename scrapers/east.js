import { runSnapScraper } from "./snap.js";

runSnapScraper({
  schoolName: "East High School",
  organizationId: "EastHS",
  homeAddress: { address: "2929 Charles St", city: "Rockford", state: "IL", zip: "61108" },
  outputFile: "../data/east.csv",
}).catch(console.error);
