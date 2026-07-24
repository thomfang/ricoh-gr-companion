import { Navigation, Script } from "scripting"
import App from "./src/App"

async function run() {
  await Navigation.present(<App />)
  Script.exit()
}

run()
