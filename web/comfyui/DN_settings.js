import { app } from "../../scripts/app.js"

app.registerExtension({
  name: "DN Settings",
  settings: [
    {
      id: "dadosNodes.hf_token",
      name: "Hugging Face Token",
      type: "string",
      defaultValue: "",
      category: ["Dado's Nodes", "Access Token", "Hugging Face Token"],
      tooltip: "Hugging Face token for accessing gated models like PixAI Tagger. Don't forget to get granted access on Hugging Face model site"
    }
  ]
});