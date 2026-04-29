import { runSnapScraper } from "./snap.js";

runSnapScraper({
  schoolName: "Jefferson High School",
  organizationId: "jeffersonHS",
  homeAddress: { address: "4145 Marchesano Dr", city: "Rockford", state: "IL", zip: "61108" },
  outputFile: "../data/jefferson.csv",
}).catch(console.error);
