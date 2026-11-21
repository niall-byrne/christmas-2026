import path from "node:path"
import { pathToFileURL } from "node:url"
import { ConfigDrivenCliCommand } from "@/cli/bases/baseCommand"
import { createGameConfig } from "@/cli/create-game/config"

export class CreateGameCommand extends ConfigDrivenCliCommand<
  typeof createGameConfig
> {
  constructor() {
    super(createGameConfig)
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  void new CreateGameCommand().run(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode
  })
}
