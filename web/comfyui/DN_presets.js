import { app } from "../../scripts/app.js"

app.registerExtension({
  name: "DN Settings",
  settings: [
    {
      id: "dadosNodes.hf_token",
      name: "Hugging Face Token",
      type: "string",
      defaultValue: "",
      category: ["Dado's Nodes", "Access Token - API Keys", "Hugging Face Token"],
      tooltip: "Hugging Face token for accessing gated models. Don't forget to get granted access on Hugging Face model site"
    },
    {
      id: "dadosNodes.chutes_api_key",
      name: "Chutes API key",
      type: "string",
      defaultValue: "",
      category: ["Dado's Nodes", "Access Token - API Keys", "Chutes API key"],
      tooltip: "API key for Chutes.ai image generation services"
    }
  ]
});