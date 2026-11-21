import type { CliStep } from "@/contracts/cli/step"
import { parseCreatedGameId } from "@/cli/create-game/gameResponse"
import { BaseCliConfig } from "@/cli/bases/baseConfig"
import { validateCreateGameData } from "@/cli/create-game/validateGameData"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { BonusCardSchema, CardStateSchema } from "@/schemas/gameData/card"
import { ERROR_MESSAGES } from "@/schemas/gameData/error"
import { GameNameSchema, GamePasswordSchema } from "@/schemas/gameData/game"
import { CreateJoinUrlStep } from "@/lib/cli/step/createJoinUrlStep"
import { DividerStep } from "@/lib/cli/step/dividerStep"
import { InputStep } from "@/lib/cli/step/inputStep"
import { OpenFileStep } from "@/lib/cli/step/openFileStep"
import { OutputStep } from "@/lib/cli/step/outputStep"
import { PasswordStep } from "@/lib/cli/step/passwordStep"
import { PostJsonStep } from "@/lib/cli/step/postJsonStep"
import { QrCodeStep } from "@/lib/cli/step/qrCodeStep"
import { ReadJsonFileStep } from "@/lib/cli/step/readJsonFileStep"
import { RepeatStep } from "@/lib/cli/step/repeatStep"
import { ResolveHttpOriginStep } from "@/lib/cli/step/resolveHttpOriginStep"
import { TransformStep } from "@/lib/cli/step/transformStep"
import { ValidateStep } from "@/lib/cli/step/validateStep"

export class CreateGameConfig extends BaseCliConfig {
  readonly usage =
    "Usage: npm run game:create [--file <path>] [--url <origin>] [--out <path>]"

  readonly optionMap = {
    "--file": "file",
    "--url": "url",
    "--out": "out",
  } as const

  readonly environmentFiles = [".env.local", ".env"]

  readonly workflowSteps: readonly CliStep[] = [
    new ResolveHttpOriginStep({
      outputKey: "origin",
      value: (context) => this.getOption(context, "url") ?? process.env.HOST,
      environmentVariable: "HOST",
      option: "--url",
      rootPath: "/",
    }),
    new ReadJsonFileStep({
      outputKey: "fileData",
      path: (context) => this.getOption(context, "file"),
      encoding: "utf8",
    }),
    new TransformStep({
      outputKey: "gameData",
      transform: (context) =>
        Object.hasOwn(context, "fileData")
          ? context.fileData
          : this.getContextRecord(context, "promptAnswers"),
    }),
    new ValidateStep({
      key: "gameData",
      validate: validateCreateGameData,
    }),
    new PostJsonStep({
      url: (context) =>
        new URL("/api/v1/games", this.getContextString(context, "origin")),
      bodyKey: "gameData",
      outputKey: "gameId",
      operation: "Game creation",
      method: "POST",
      contentTypeHeader: "content-type",
      contentType: "application/json",
      successStatus: 201,
      parseSuccess: (payload) => parseCreatedGameId(payload, "gameId"),
    }),
    new CreateJoinUrlStep({
      originKey: "origin",
      gameIdKey: "gameId",
      gameDataKey: "gameData",
      outputKey: "joinUrl",
      path: "/play/game",
      passwordField: "password",
      passwordQueryParameter: "password",
    }),
    new QrCodeStep({
      urlKey: "joinUrl",
      outputKey: "qrPath",
      fileName: (context) => this.getContextString(context, "gameId"),
      requestedPath: (context) => this.getOption(context, "out"),
      temporaryDirectoryPrefix: "christmas-game-",
      width: 512,
      margin: 2,
      extension: ".png",
    }),
    new OpenFileStep("qrPath"),
    new OutputStep({
      lines: [
        () => "Your game is ready!",
        (context) => `Game ID: ${this.getContextString(context, "gameId")}`,
        (context) =>
          `Your join QR code is ready to print: ${this.getContextString(context, "qrPath")}`,
        (context) => {
          const joinUrl = context.joinUrl
          if (!(joinUrl instanceof URL)) {
            throw new CliBaseError("Cannot read workflow URL: joinUrl")
          }
          return `Players can also join here: ${joinUrl}`
        },
      ],
    }),
  ]

  readonly interactivePromptConfigSteps: readonly CliStep[] = [
    new DividerStep(),
    new InputStep({
      key: "name",
      message: "Enter the game's name:",
      schema: GameNameSchema,
      errorMessages: ERROR_MESSAGES,
    }),
    new PasswordStep({
      key: "password",
      message: "Enter a password for your game:",
      mask: "*",
      schema: GamePasswordSchema,
      errorMessages: ERROR_MESSAGES,
    }),
    new InputStep({
      key: "bonusCard",
      message: "The prize will be a bonus card, what identifies it:",
      schema: BonusCardSchema,
      errorMessages: ERROR_MESSAGES,
    }),
    new DividerStep(),
    new RepeatStep({
      key: "cards",
      steps: [
        new InputStep({
          key: "recipient",
          message: "What is the recipient's name:",
          schema: CardStateSchema.shape.recipient,
          errorMessages: ERROR_MESSAGES,
        }),
        new InputStep({
          key: "identifier",
          message: "What identifies this card:",
          schema: CardStateSchema.shape.identifier,
          errorMessages: ERROR_MESSAGES,
        }),
        new DividerStep(),
      ],
      heading: (number: number) => `Card #${number}`,
      minimumCount: 1,
      addAnother: { message: "Add another card?", default: false },
      blankLine: "",
    }),
  ]

  readonly interactivePromptConfig = {
    whenOptionMissing: "file",
    introduction: "Let's setup a new game...",
    steps: this.interactivePromptConfigSteps,
  }
}

export const createGameConfig = new CreateGameConfig()
