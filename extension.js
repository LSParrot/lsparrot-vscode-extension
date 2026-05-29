const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const util = require("util");
const vscode = require("vscode");
const { LanguageClient, RevealOutputChannelOn, State, CloseAction, ErrorAction } = require("vscode-languageclient/node");

const execFile = util.promisify(childProcess.execFile);
const CONFIG_SECTION = "lsparrot";
const EXTENSION_ID = "zeriyoshi.php-lsparrot";
const EXTENSION_NAME = "LSParrot";
const ENABLED_STATUS_ICON = "$(check)";
const DISABLED_STATUS_ICON = "$(debug-stop)";
const MAX_CONSECUTIVE_SERVER_STARTS = 5;
const SERVER_START_STABLE_RESET_MS = 30000;
const PHPDOC_SEMANTIC_TOKEN_TYPES = ["keyword", "type", "parameter", "property", "operator", "string", "number", "variable"];
const PHPDOC_SEMANTIC_TOKEN = Object.freeze({
  keyword: 0,
  type: 1,
  parameter: 2,
  property: 3,
  operator: 4,
  string: 5,
  number: 6,
  variable: 7
});
const PHPDOC_SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(PHPDOC_SEMANTIC_TOKEN_TYPES, []);
const PHPDOC_TYPE_TAG_PATTERN = /@(?:(?:phpstan|psalm)-)?(?:param(?:-out)?|return|var|throws|template(?:-(?:covariant|contravariant))?|property(?:-read|-write)?|method|extends|implements|use|mixin|assert(?:-if-(?:true|false))?|self-out|this-out)\b|@(?:phpstan|psalm)-(?:type|import-type)\b/g;
const PHPDOC_GENERIC_TAG_PATTERN = /@(?:phpstan|psalm)-[A-Za-z][A-Za-z0-9-]*|@[A-Za-z][A-Za-z0-9-]*/g;
const PHPDOC_BUILTIN_TYPES = new Set([
  "array", "array-key", "bool", "boolean", "callable", "callable-string", "class-string", "closed-resource",
  "double", "enum-string", "false", "float", "int", "integer", "interface-string", "iterable", "literal-string",
  "list", "lowercase-string", "mixed", "negative-int", "never", "non-decimal-int-string", "non-empty-array",
  "non-empty-list", "non-empty-literal-string", "non-empty-lowercase-string", "non-empty-string",
  "non-empty-uppercase-string", "non-falsy-string", "non-negative-int", "non-positive-int", "null", "numeric",
  "numeric-string", "object", "parent", "positive-int", "pure-callable", "resource", "scalar", "self", "static",
  "string", "trait-string", "true", "truthy-string", "uppercase-string", "void"
]);
const PHPDOC_UTILITY_TYPES = new Set([
  "key-of", "value-of", "template-type", "new", "properties-of", "public-properties-of",
  "protected-properties-of", "private-properties-of", "class-string-map", "int-mask", "int-mask-of"
]);
const PHPDOC_TYPE_KEYWORDS = new Set(["as", "of", "super", "from", "is", "not"]);
const RUNTIME_MESSAGES = {
  en: {
    "log.configurationChanged": "Configuration changed; restarting server.",
    "log.targetProject": "Current target project: {path}",
    "status.stopped": "{name} is stopped.",
    "status.disabled": "{name} is disabled.",
    "status.starting": "Starting {name}.",
    "status.running": "{name} is running.",
    "status.startFailed": "Failed to start {name}: {message}",
    "status.startLimitReached": "{name} stopped after {count} consecutive start attempts.",
    "startup.phpNotFound": "PHP executable \"{phpPath}\" was not found. Configure lsparrot.phpPath to a valid PHP CLI binary.",
    "startup.phpNotExecutable": "Unable to execute PHP binary \"{phpPath}\": {message}. Configure lsparrot.phpPath to a valid PHP CLI binary.",
    "startup.extensionMissing": "The PHP binary \"{phpPath}\" does not have the lsparrot extension loaded. Build/install ext-lsparrot or set lsparrot.extensionPath to the extension binary.",
    "startup.probeFailed": "Failed to inspect PHP binary \"{phpPath}\" for lsparrot support: {message}",
    "status.analyzingProject": "Analyzing PHP project.",
    "status.modeStarting": "Starting",
    "tooltip.project": "Project: {name} ({path})",
    "tooltip.driver": "Driver: {driver}",
    "tooltip.analyzersReady": "External analyzer cache is ready for this Composer project.",
    "tooltip.analyzersPending": "External analyzer cache is still warming for this Composer project.",
    "tooltip.analyzersUnavailable": "One or more selected analyzer backends cannot run in this Composer project.",
    "tooltip.switchAnalyzer": "Click to select additional backends.",
    "tooltip.revealProject": "Click to reveal the project root in Explorer.",
    "tooltip.toggleDisable": "Click to disable LSParrot.",
    "tooltip.toggleEnable": "Click to enable LSParrot.",
    "tooltip.openSettings": "Click to open LSParrot settings.",
    "action.openSettings": "Open Settings",
    "lsparrot.enabled": "LSParrot enabled.",
    "lsparrot.disabled": "LSParrot disabled.",
    "project.noRoot": "No active LSParrot project root found.",
    "selectAnalyzer.title": "Select Additional Backends",
    "selectAnalyzer.placeHolder": "Choose additional analyzer backends available in this Composer project",
    "selectAnalyzer.current": "Current",
    "selectAnalyzer.unavailable": "Unavailable",
    "selectAnalyzer.installRequired": "{mode} is not installed in this Composer project.",
    "selectAnalyzer.psalmConfigRequired": "Psalm requires psalm.xml or psalm.xml.dist in this Composer project.",
    "selectAnalyzer.phpstan.description": "Use PHPStan",
    "selectAnalyzer.phpstan.detail": "Uses PHPStan for richer type information and diagnostics.",
    "selectAnalyzer.psalm.description": "Use Psalm",
    "selectAnalyzer.psalm.detail": "Uses Psalm for richer type information and diagnostics.",
    "selectAnalyzer.psalmLs.description": "Use Psalm LS",
    "selectAnalyzer.psalmLs.detail": "Uses Psalm Language Server for live unsaved-buffer analysis.",
    "selectAnalyzer.changed": "Additional backends changed to {mode}.",
    "selectAnalyzer.alreadySelected": "{mode} is already selected.",
    "symbolSearch.title": "PHP FuzzyFinder",
    "symbolSearch.placeHolder": "Type a PHP symbol or terminal",
    "symbolSearch.noServer": "LSParrot server is not running.",
    "symbolSearch.noSymbols": "No PHP symbols found.",
    "symbolSearch.terminal.description": "Terminal",
    "symbolSearch.terminal.detail": "Open a new terminal",
    "methodSearch.noMethod": "Place the cursor on a method name.",
    "methodSearch.noMatches": "No matching PHP method definitions found.",
    "methodSearch.title": "Jump to Method Definition",
    "methodSearch.placeHolder": "Choose a method definition",
    "codegen.noClass": "Place the cursor inside a PHP class.",
    "codegen.noProperties": "No instance properties found.",
    "codegen.constructorExists": "This class already has a constructor.",
    "codegen.methodName": "Method name",
    "codegen.invalidMethod": "Enter a valid PHP method name.",
    "codegen.generated": "Generated PHP code.",
    "framework.noArtifacts": "No Symfony/Laravel artifacts found.",
    "framework.title": "Symfony/Laravel Artifacts",
    "debug.noFile": "Open a PHP file to start debugging.",
    "debug.started": "Started PHP debug handoff.",
    "test.runnerMissing": "No PHPUnit or Pest runner was found for this workspace.",
    "codeLens.extends": "Extends",
    "codeLens.implements": "Implements",
    "codeLens.extendTree": "extend tree",
    "codeLens.extendsBy": "extends by",
    "codeLens.extendedBy": "Extended by",
    "codeLens.implementedBy": "Implemented by",
    "codeLens.override": "Overrides",
    "codeLens.noTargets": "No target definitions found.",
    "gitBlame.enabled": "Git blame hints enabled.",
    "gitBlame.disabled": "Git blame hints disabled.",
    "gitBlame.noCommit": "No git blame commit found for this line.",
    "gitBlame.showFailed": "Failed to show commit: {message}",
    "metric.unknown": "?"
  },
  ja: {
    "log.configurationChanged": "Configuration changed; restarting server.",
    "log.targetProject": "Current target project: {path}",
    "status.stopped": "{name} は停止しています。",
    "status.disabled": "{name} は無効です。",
    "status.starting": "{name} を起動しています。",
    "status.running": "{name} は実行中です。",
    "status.startFailed": "{name} の起動に失敗しました: {message}",
    "status.startLimitReached": "{name} は連続 {count} 回の起動後に停止しました。",
    "startup.phpNotFound": "PHP 実行ファイル \"{phpPath}\" が見つかりません。lsparrot.phpPath に有効な PHP CLI バイナリを設定してください。",
    "startup.phpNotExecutable": "PHP 実行ファイル \"{phpPath}\" を実行できません: {message}。lsparrot.phpPath に有効な PHP CLI バイナリを設定してください。",
    "startup.extensionMissing": "PHP 実行ファイル \"{phpPath}\" で lsparrot 拡張が読み込まれていません。ext-lsparrot をビルド/インストールするか、lsparrot.extensionPath に拡張バイナリを設定してください。",
    "startup.probeFailed": "PHP 実行ファイル \"{phpPath}\" の lsparrot 対応確認に失敗しました: {message}",
    "status.analyzingProject": "PHP プロジェクトを解析しています。",
    "status.modeStarting": "起動中",
    "tooltip.project": "プロジェクト: {name} ({path})",
    "tooltip.driver": "ドライバー: {driver}",
    "tooltip.analyzersReady": "この Composer プロジェクトの外部解析キャッシュは準備完了です。",
    "tooltip.analyzersPending": "この Composer プロジェクトの外部解析キャッシュを準備中です。",
    "tooltip.analyzersUnavailable": "選択中の解析バックエンドの一部はこの Composer プロジェクトで実行できません。",
    "tooltip.switchAnalyzer": "クリックして追加バックエンドを選択します。",
    "tooltip.revealProject": "クリックして Explorer でプロジェクト root を表示します。",
    "tooltip.toggleDisable": "クリックして LSParrot を無効にします。",
    "tooltip.toggleEnable": "クリックして LSParrot を有効にします。",
    "tooltip.openSettings": "クリックして LSParrot の設定を開きます。",
    "action.openSettings": "設定を開く",
    "lsparrot.enabled": "LSParrot を有効にしました。",
    "lsparrot.disabled": "LSParrot を無効にしました。",
    "project.noRoot": "有効な LSParrot プロジェクト root が見つかりません。",
    "selectAnalyzer.title": "追加バックエンド選択",
    "selectAnalyzer.placeHolder": "この Composer プロジェクトで利用できる追加バックエンドを選択してください",
    "selectAnalyzer.current": "現在",
    "selectAnalyzer.unavailable": "利用不可",
    "selectAnalyzer.installRequired": "{mode} はこの Composer プロジェクトにインストールされていません。",
    "selectAnalyzer.psalmConfigRequired": "Psalm にはこの Composer プロジェクトの psalm.xml または psalm.xml.dist が必要です。",
    "selectAnalyzer.phpstan.description": "PHPStan を使用",
    "selectAnalyzer.phpstan.detail": "PHPStan による詳細な型情報と診断を使用します。",
    "selectAnalyzer.psalm.description": "Psalm を使用",
    "selectAnalyzer.psalm.detail": "Psalm による詳細な型情報と診断を使用します。",
    "selectAnalyzer.psalmLs.description": "Psalm LS を使用",
    "selectAnalyzer.psalmLs.detail": "Psalm Language Server による未保存状態のライブ解析を使用します。",
    "selectAnalyzer.changed": "追加バックエンドを {mode} に変更しました。",
    "selectAnalyzer.alreadySelected": "{mode} はすでに選択されています。",
    "symbolSearch.title": "PHP FuzzyFinder",
    "symbolSearch.placeHolder": "PHP シンボルまたは terminal を入力してください",
    "symbolSearch.noServer": "LSParrot サーバーが起動していません。",
    "symbolSearch.noSymbols": "PHP シンボルが見つかりません。",
    "symbolSearch.terminal.description": "ターミナル",
    "symbolSearch.terminal.detail": "新しいターミナルを開きます",
    "methodSearch.noMethod": "メソッド名にカーソルを置いてください。",
    "methodSearch.noMatches": "一致する PHP メソッド定義が見つかりません。",
    "methodSearch.title": "メソッド定義へジャンプ",
    "methodSearch.placeHolder": "メソッド定義を選択してください",
    "codegen.noClass": "PHP クラス内にカーソルを置いてください。",
    "codegen.noProperties": "インスタンスプロパティが見つかりません。",
    "codegen.constructorExists": "このクラスには既にコンストラクタがあります。",
    "codegen.methodName": "メソッド名",
    "codegen.invalidMethod": "有効な PHP メソッド名を入力してください。",
    "codegen.generated": "PHP コードを生成しました。",
    "framework.noArtifacts": "Symfony/Laravel の候補が見つかりません。",
    "framework.title": "Symfony/Laravel アーティファクト",
    "debug.noFile": "デバッグする PHP ファイルを開いてください。",
    "debug.started": "PHP デバッグ委譲を開始しました。",
    "test.runnerMissing": "このワークスペースで PHPUnit/Pest runner が見つかりません。",
    "codeLens.extends": "継承",
    "codeLens.implements": "実装",
    "codeLens.extendTree": "extend tree",
    "codeLens.extendsBy": "extends by",
    "codeLens.extendedBy": "継承先",
    "codeLens.implementedBy": "実装先",
    "codeLens.override": "Override",
    "codeLens.noTargets": "ジャンプ先の定義が見つかりません。",
    "gitBlame.enabled": "Git blame 表示を有効にしました。",
    "gitBlame.disabled": "Git blame 表示を無効にしました。",
    "gitBlame.noCommit": "この行の git blame commit が見つかりません。",
    "gitBlame.showFailed": "commit 詳細の表示に失敗しました: {message}",
    "metric.unknown": "?"
  }
};

let client;
let clientDisposables = [];
let activeClients = new Set();
let activeServerProcesses = new Set();
let extensionContext;
let outputChannel;
let statusBarItem;
let statusSettingsItem;
let statusEngineItem;
let statusProjectItem;
let statusMemoryItem;
let statusProcessItem;
let statusProcessMemoryItem;
let activeAnalyzerStatuses = new Set();
let currentDriverLabel = "LSParrot Engine";
let currentWorkspaceRoot = "";
let currentAnalyzerSetting = [];
let currentAnalyzerProjectRoot = "";
let lastLoggedProjectRoot = "";
let phpstanLevelIgnoredProjects = new Set();
let psalmLevelIgnoredProjects = new Set();
let analyzerInstallWatchers = [];
let analyzerRestartTimer;
let analyzerInstallPollTimer;
let crashRestartTimer;
let activeProjectRestartTimer;
let serverStartStableResetTimer;
let serverLifecycleGeneration = 0;
let consecutiveServerStartCount = 0;
let serverStartLimitReached = false;
let statusPollTimer;
let serverStartInProgress = false;
let preloadThisMemberTimers = new Map();
let memberCacheFileWatcher;
let currentServerStatus = {};
let currentProcessMetrics = { count: 0, rssBytes: 0 };
let currentStatusState = "stopped";
let currentStatusTooltip = "";
let codeLensEmitter;
let classDescendantCache = new Map();
let classDescendantPending = new Set();
let classDescendantCacheGeneration = 0;
let gitBlameEnabled = false;
let gitBlameEmitter;
let gitBlameCache = new Map();
let gitRootCache = new Map();
let intentionalClientStop = false;
let phpPropertyDecorationType;
let phpTestController;
let phpTestWatchers = [];
let phpTestItemData = new Map();

function activate(context) {
  extensionContext = context;
  outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
  phpPropertyDecorationType = vscode.window.createTextEditorDecorationType({
    light: { color: "#000000" },
    dark: { color: "#D4D4D4" }
  });
  context.subscriptions.push(phpPropertyDecorationType);
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBarItem.name = EXTENSION_NAME;
  statusBarItem.command = "lsparrot.toggleEnabled";
  statusSettingsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9.5);
  statusSettingsItem.name = EXTENSION_NAME + " Settings";
  statusSettingsItem.command = "lsparrot.openSettings";
  statusEngineItem = createStatusMetricItem("LSParrot Engine", 9);
  statusEngineItem.command = "lsparrot.selectAdditionalBackends";
  statusProjectItem = createStatusMetricItem("LSParrot Project", 8);
  statusProjectItem.command = "lsparrot.revealProjectRoot";
  statusMemoryItem = createStatusMetricItem("LSParrot Memory", 7);
  statusProcessItem = createStatusMetricItem("LSParrot Processes", 6);
  statusProcessMemoryItem = createStatusMetricItem("LSParrot Process Memory", 5);
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(statusSettingsItem);
  context.subscriptions.push(statusEngineItem);
  context.subscriptions.push(statusProjectItem);
  context.subscriptions.push(statusMemoryItem);
  context.subscriptions.push(statusProcessItem);
  context.subscriptions.push(statusProcessMemoryItem);
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.restart", restart));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.toggleEnabled", toggleLsparrotEnabled));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.openSettings", openLsparrotSettings));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.selectAdditionalBackends", selectAnalyzerMode));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.revealProjectRoot", revealActiveProjectRootInExplorer));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.searchWorkspaceSymbols", searchWorkspaceSymbols));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.findMethodByName", findMethodByNameCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.showClassSupertypes", showClassSupertypesCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.showClassRelations", showClassRelationsCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.showExtendTree", showExtendTreeCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.goToOverrideTarget", goToOverrideTargetCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.showReferences", showReferencesCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.generateConstructor", generateConstructorCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.generateGettersSetters", generateGettersSettersCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.generateMethodStub", generateMethodStubCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.searchFrameworkArtifacts", searchFrameworkArtifactsCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.debugCurrentFile", debugCurrentFileCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.toggleGitBlame", toggleGitBlame));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.showGitBlameCommit", showGitBlameCommit));
  context.subscriptions.push(vscode.commands.registerCommand("lsparrot.showOutput", () => {
    outputChannel.show(true);
  }));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider({ scheme: "file", language: "php" }, createFallbackMethodDefinitionProvider()));
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ scheme: "file", language: "php" }, createPhpDocSemanticTokensProvider(), PHPDOC_SEMANTIC_LEGEND));
  codeLensEmitter = new vscode.EventEmitter();
  context.subscriptions.push(codeLensEmitter);
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", language: "php" }, createPhpCodeLensProvider()));
  initializePhpTesting(context);
  gitBlameEmitter = new vscode.EventEmitter();
  context.subscriptions.push(gitBlameEmitter);
  context.subscriptions.push(vscode.languages.registerInlayHintsProvider({ scheme: "file", language: "php" }, createGitBlameInlayProvider()));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(CONFIG_SECTION)) {
      persistActiveProjectVscodeConfigFromSettings(event);
      log(localize("log.configurationChanged"));
      if (event.affectsConfiguration(CONFIG_SECTION + ".enabled")) {
        applyLsparrotEnabledConfiguration();
      } else if (isLsparrotEnabled()) {
        restart();
      } else {
        applyLsparrotEnabledConfiguration();
      }
    }
  }));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    scheduleRestartWhenActiveProjectConfigurationChanged();
    refreshServerStatus();
    updatePhpPropertyDecorations();
  }));
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(updatePhpPropertyDecorations));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === "php") {
      updatePhpPropertyDecorations();
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(scheduleThisMemberPreload));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(clearThisMemberPreloadTimer));
  ensureMemberCacheInvalidationWatcher(context);

  setStatus("stopped", localize(isLsparrotEnabled() ? "status.stopped" : "status.disabled", { name: EXTENSION_NAME }));
  updatePhpPropertyDecorations();
  if (isLsparrotEnabled()) {
    start(context).catch(handleUnexpectedStartFailure);
  }
}

function deactivate() {
  return stop();
}

function isLsparrotEnabled() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get("enabled", true) !== false;
}

function lsparrotEnabledConfigurationTarget() {
  return vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

async function updateLsparrotEnabled(value) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  await config.update("enabled", value === true, lsparrotEnabledConfigurationTarget());
}

async function toggleLsparrotEnabled() {
  const enabled = !isLsparrotEnabled();

  await updateLsparrotEnabled(enabled);
  vscode.window.showInformationMessage(localize(enabled ? "lsparrot.enabled" : "lsparrot.disabled"));
}

async function openLsparrotSettings() {
  await vscode.commands.executeCommand("workbench.action.openSettings", "lsparrot");
}

async function applyLsparrotEnabledConfiguration() {
  if (isLsparrotEnabled()) {
    resetConsecutiveServerStarts();
    if (extensionContext !== undefined) {
      await restart();
    }
    return;
  }

  await stop();
  setStatus("stopped", localize("status.disabled", { name: EXTENSION_NAME }));
}

async function start(context) {
  if (!isLsparrotEnabled()) {
    setStatus("stopped", localize("status.disabled", { name: EXTENSION_NAME }));
    return;
  }
  if (serverStartInProgress || client !== undefined || activeClients.size > 0) {
    log("Start requested while server is already active.");
    return;
  }

  serverStartInProgress = true;
  const startGeneration = ++serverLifecycleGeneration;
  if (activeServerProcesses.size > 0) {
    terminateTrackedServerProcesses("Discarding stale LSParrot server process before start.");
  }

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configuredPhpPath = config.get("phpPath", "php");
  const phpPath = typeof configuredPhpPath === "string" && configuredPhpPath !== "" ? configuredPhpPath : "php";
  const cwd = resolveWorkspaceRoot(context);
  let runtimePhpArgs;

  intentionalClientStop = false;
  setStatus("starting", localize("status.starting", { name: EXTENSION_NAME }));
  try {
    const extensionPath = await resolveEffectiveExtensionPath(config, phpPath, cwd);

    runtimePhpArgs = buildRuntimePhpArgs(config, extensionPath);
    await verifyPhpRuntime(phpPath, runtimePhpArgs, cwd);
  } catch (error) {
    if (startGeneration !== serverLifecycleGeneration || intentionalClientStop) {
      serverStartInProgress = false;
      log("Ignoring stale PHP runtime verification failure: " + (error instanceof Error ? error.message : String(error)));
      return;
    }

    await handleStartupPreflightFailure(error);
    serverStartInProgress = false;
    return;
  }

  if (startGeneration !== serverLifecycleGeneration || intentionalClientStop || !isLsparrotEnabled()) {
    serverStartInProgress = false;
    return;
  }
  if (!recordServerStartAttempt()) {
    serverStartInProgress = false;
    return;
  }

  const analyzerDiagnosticsTimeout = numericConfig(config, "analyzerDiagnosticsTimeout", 60);
  const memoryLimit = config.get("phpMemoryLimit", "-1");
  const enableJit = config.get("enableJit", true);
  const jitBufferSize = config.get("jitBufferSize", "32M");
  const jitMode = config.get("jitMode", "tracing");
  const symbolIndexSize = config.get("symbolIndexSize", "64M");
  const workerCount = optionalPositiveIntegerConfig(config, "workerCount");
  const configuredPhpstanLevel = nonNegativeIntegerConfig(config, "phpstanLevel", 6);
  const configuredPsalmLevel = nonNegativeIntegerConfig(config, "psalmLevel", 6);
  const psalmTransport = config.get("psalm.transport", "auto");
  const psalmOnChange = config.get("psalm.onChange", true);
  const psalmOnChangeDebounceMs = numericConfig(config, "psalm.onChangeDebounceMs", 500);
  const psalmMaxResponseWaitMs = numericConfig(config, "psalm.maxResponseWaitMs", 200);
  const psalmEnableAutocomplete = config.get("psalm.enableAutocomplete", true);
  const psalmEnableDiagnostics = config.get("psalm.enableDiagnostics", true);
  const psalmEnableHover = config.get("psalm.enableHover", true);
  const psalmEnableDefinition = config.get("psalm.enableDefinition", true);
  const psalmEnableSignatureHelp = config.get("psalm.enableSignatureHelp", true);
  const psalmShowInfo = config.get("psalm.showInfo", false);
  const psalmLiveDeadCodeDiagnostics = config.get("psalm.liveDeadCodeDiagnostics", false);
  const psalmInMemory = config.get("psalm.inMemory", false);
  const startupProjectRoot = resolveActiveComposerProjectRootInWorkspace(cwd);
  const projectConfig = readProjectVscodeConfig(startupProjectRoot);
  const analyzer = projectAdditionalAnalyzerValue(projectConfig, config.get("additionalAnalyzer", []));
  const normalizedAnalyzer = normalizeAnalyzer(analyzer);
  const phpstanLevel = projectConfigInteger(projectConfig, "phpstanLevel", configuredPhpstanLevel);
  const psalmLevel = projectConfigInteger(projectConfig, "psalmLevel", configuredPsalmLevel);
  currentWorkspaceRoot = cwd;
  currentAnalyzerSetting = normalizedAnalyzer;
  currentAnalyzerProjectRoot = startupProjectRoot;
  lastLoggedProjectRoot = "";
  currentDriverLabel = initialAnalyzerDriverLabel(normalizedAnalyzer, startupProjectRoot);
  ensureProjectVscodeConfig(startupProjectRoot, {
    additionalAnalyzer: normalizedAnalyzer,
    phpstanLevel,
    psalmLevel
  });
  const options = {
    analyzer: analyzerOptionValue(normalizedAnalyzer),
    memoryLimit: typeof memoryLimit === "string" ? memoryLimit : "-1",
    jit: {
      enabled: enableJit === true,
      bufferSize: typeof jitBufferSize === "string" ? jitBufferSize : "32M",
      mode: typeof jitMode === "string" ? jitMode : "tracing"
    },
    symbolIndex: {
      size: typeof symbolIndexSize === "string" ? symbolIndexSize : "64M"
    },
    workers: {
      count: workerCount,
      analyzerDiagnosticsTimeout
    },
    phpstan: {
      level: phpstanLevel
    },
    psalm: {
      level: psalmLevel,
      transport: normalizePsalmTransport(psalmTransport),
      onChange: psalmOnChange === true,
      onChangeDebounceMs: psalmOnChangeDebounceMs,
      maxResponseWaitMs: psalmMaxResponseWaitMs,
      enableAutocomplete: psalmEnableAutocomplete === true,
      enableDiagnostics: psalmEnableDiagnostics === true,
      enableHover: psalmEnableHover === true,
      enableDefinition: psalmEnableDefinition === true,
      enableSignatureHelp: psalmEnableSignatureHelp === true,
      showInfo: psalmShowInfo === true,
      liveDeadCodeDiagnostics: psalmLiveDeadCodeDiagnostics === true,
      inMemory: psalmInMemory === true
    },
    workerPhpArgs: runtimePhpArgs
  };
  const args = [...runtimePhpArgs];

  args.push("-ddisplay_errors=stderr");
  args.push("-dlog_errors=1");
  args.push("-r");
  args.push("LSParrot\\start_lsp(json_decode(" + phpString(JSON.stringify(options)) + ", true, 512, JSON_THROW_ON_ERROR));");

  const serverOptions = async () => {
    let child;

    if (startGeneration !== serverLifecycleGeneration) {
      throw new Error("LSParrot server start was superseded.");
    }

    child = childProcess.spawn(phpPath, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    trackServerProcess(child);

    return { process: child, detached: false };
  };

  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "php" }],
    outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    errorHandler: {
      error: () => ({ action: ErrorAction.Continue }),
      closed: () => ({ action: CloseAction.DoNotRestart })
    }
  };

  log("Starting server.");
  log("cwd: " + cwd);
  log("command: " + formatCommand(phpPath, args));
  setStatus("starting", localize("status.starting", { name: EXTENSION_NAME }));

  client = new LanguageClient(
    EXTENSION_ID,
    EXTENSION_NAME,
    serverOptions,
    clientOptions
  );

  activeClients.add(client);
  clientDisposables.push(client.onNotification("lsparrot.php/analyzerStatus", handleAnalyzerStatus));
  clientDisposables.push(client.onNotification("lsparrot.php/completionReady", handleAnalyzerCompletionReady));
  const startedClient = client;
  clientDisposables.push(client.onDidChangeState((event) => {
    log("state: " + stateName(event.oldState) + " -> " + stateName(event.newState));
    if (event.newState === State.Running) {
      resetClassDescendantCache();
      scheduleServerStartStableReset(startedClient);
      startStatusPolling();
      for (const document of vscode.workspace.textDocuments) {
        scheduleThisMemberPreload(document);
      }
      if (activeAnalyzerStatuses.size === 0) {
        setStatus("ready", localize("status.running", { name: EXTENSION_NAME }));
      }
    } else if (event.newState === State.Stopped) {
      const shouldRestart = !intentionalClientStop && client === startedClient;
      activeClients.delete(startedClient);
      activeAnalyzerStatuses.clear();
      resetClassDescendantCache();
      clearServerStartStableResetTimer();
      clearStatusPolling();
      setStatus("stopped", localize("status.stopped", { name: EXTENSION_NAME }));
      if (shouldRestart) {
        client = undefined;
        terminateTrackedServerProcesses("Cleaning up stopped LSParrot server.");
        scheduleServerRestart("LSP server stopped unexpectedly");
      }
    }
  }));

  serverStartInProgress = false;
  client.start().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const localizedMessage = localize("status.startFailed", { name: EXTENSION_NAME, message });
    if (client !== startedClient || startGeneration !== serverLifecycleGeneration || intentionalClientStop) {
      activeClients.delete(startedClient);
      log("Ignoring stale server start failure: " + message);
      return;
    }

    log("Failed to start server: " + message);
    activeClients.delete(startedClient);
    activeAnalyzerStatuses.clear();
    setStatus("stopped", localizedMessage);
    vscode.window.showErrorMessage(localizedMessage);
    if (!intentionalClientStop) {
      client = undefined;
      terminateTrackedServerProcesses("Cleaning up failed LSParrot server start.");
      scheduleServerRestart("LSP server failed to start");
    }
  });
}

async function restart() {
  resetConsecutiveServerStarts();
  clearCrashRestartTimer();
  await stop();
  if (extensionContext !== undefined && isLsparrotEnabled()) {
    await start(extensionContext).catch(handleUnexpectedStartFailure);
  } else if (!isLsparrotEnabled()) {
    setStatus("stopped", localize("status.disabled", { name: EXTENSION_NAME }));
  }
}

async function stop() {
  let clientsToStop, result;

  intentionalClientStop = true;
  serverLifecycleGeneration++;
  serverStartInProgress = false;
  clearCrashRestartTimer();
  if (client === undefined && activeClients.size === 0 && activeServerProcesses.size === 0) {
    return undefined;
  }

  clientsToStop = [...activeClients];
  if (client !== undefined && !activeClients.has(client)) {
    clientsToStop.push(client);
  }

  client = undefined;
  activeClients.clear();
  activeAnalyzerStatuses.clear();
  resetClassDescendantCache();
  clearServerStartStableResetTimer();
  clearStatusPolling();
  clearThisMemberPreloadTimers();
  clearActiveProjectRestartTimer();
  clearAnalyzerInstallWatchers();
  disposeClientDisposables();
  if (analyzerRestartTimer !== undefined) {
    clearTimeout(analyzerRestartTimer);
    analyzerRestartTimer = undefined;
  }
  setStatus("stopped", localize("status.stopped", { name: EXTENSION_NAME }));
  result = await Promise.allSettled(clientsToStop.map((entry) => entry.stop(1000)));
  terminateTrackedServerProcesses("Stopping LSParrot server.");

  return result;
}

function disposeClientDisposables() {
  for (const disposable of clientDisposables) {
    disposable.dispose();
  }
  clientDisposables = [];
}

function trackServerProcess(child) {
  if (child === undefined) {
    return;
  }

  activeServerProcesses.add(child);
  log("server pid: " + (child.pid || "?"));
  updateProcessMetricsSoon();
  child.once("exit", (code, signal) => {
    activeServerProcesses.delete(child);
    updateProcessMetricsSoon();
    log("server process exited: pid=" + (child.pid || "?") + " code=" + String(code) + " signal=" + String(signal));
  });
  child.once("error", (error) => {
    activeServerProcesses.delete(child);
    updateProcessMetricsSoon();
    log("server process error: " + (error instanceof Error ? error.message : String(error)));
  });
}

function terminateTrackedServerProcesses(reason) {
  const processes = Array.from(activeServerProcesses);

  if (processes.length === 0) {
    return;
  }

  log(reason);
  for (const child of processes) {
    terminateTrackedServerProcess(child);
  }
}

function serverProcessHasExited(child) {
  return child.exitCode !== null && child.exitCode !== undefined
    || child.signalCode !== null && child.signalCode !== undefined;
}

function terminateTrackedServerProcess(child) {
  if (child === undefined) {
    return;
  }

  if (serverProcessHasExited(child)) {
    activeServerProcesses.delete(child);
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch (error) {
    log("failed to terminate server process: " + (error instanceof Error ? error.message : String(error)));
  }

  setTimeout(() => {
    if (serverProcessHasExited(child)) {
      activeServerProcesses.delete(child);
      return;
    }

    try {
      child.kill("SIGKILL");
    } catch (error) {
      log("failed to force terminate server process: " + (error instanceof Error ? error.message : String(error)));
    }
  }, 1500);
}

function recordServerStartAttempt() {
  if (serverStartLimitReached) {
    setStatus("stopped", localize("status.startLimitReached", { name: EXTENSION_NAME, count: MAX_CONSECUTIVE_SERVER_STARTS }));
    return false;
  }

  consecutiveServerStartCount++;
  log("Server start attempt " + String(consecutiveServerStartCount) + "/" + String(MAX_CONSECUTIVE_SERVER_STARTS) + ".");

  return true;
}

function resetConsecutiveServerStarts() {
  consecutiveServerStartCount = 0;
  serverStartLimitReached = false;
  clearServerStartStableResetTimer();
}

function scheduleServerStartStableReset(startedClient) {
  clearServerStartStableResetTimer();
  serverStartStableResetTimer = setTimeout(() => {
    serverStartStableResetTimer = undefined;
    if (client !== startedClient || client === undefined || client.state !== State.Running) {
      return;
    }
    resetConsecutiveServerStarts();
  }, SERVER_START_STABLE_RESET_MS);
}

function clearServerStartStableResetTimer() {
  if (serverStartStableResetTimer !== undefined) {
    clearTimeout(serverStartStableResetTimer);
    serverStartStableResetTimer = undefined;
  }
}

function stopAfterConsecutiveStartLimit(reason) {
  if (serverStartLimitReached) {
    return;
  }

  serverStartLimitReached = true;
  clearCrashRestartTimer();
  clearServerStartStableResetTimer();
  terminateTrackedServerProcesses("Stopping LSParrot after consecutive start limit.");
  log(reason + "; reached consecutive start limit.");
  updateLsparrotEnabled(false).then(() => {
    const message = localize("status.startLimitReached", { name: EXTENSION_NAME, count: MAX_CONSECUTIVE_SERVER_STARTS });

    setStatus("stopped", message);
    vscode.window.showWarningMessage(message);
  }, (error) => {
    log("failed to disable LSParrot after consecutive start limit: " + (error instanceof Error ? error.message : String(error)));
  });
}

function scheduleServerRestart(reason) {
  const scheduledGeneration = serverLifecycleGeneration;

  if (intentionalClientStop || extensionContext === undefined) {
    return;
  }
  if (crashRestartTimer !== undefined) {
    return;
  }
  if (consecutiveServerStartCount >= MAX_CONSECUTIVE_SERVER_STARTS) {
    stopAfterConsecutiveStartLimit(reason);
    return;
  }

  log(reason + "; restarting server.");
  setStatus("starting", localize("status.starting", { name: EXTENSION_NAME }));
  crashRestartTimer = setTimeout(() => {
    crashRestartTimer = undefined;
    if (intentionalClientStop || extensionContext === undefined || scheduledGeneration !== serverLifecycleGeneration) {
      return;
    }
    terminateTrackedServerProcesses("Cleaning up stale LSParrot server before crash restart.");
    start(extensionContext).catch(handleUnexpectedStartFailure);
  }, 1000);
}

function clearCrashRestartTimer() {
  if (crashRestartTimer !== undefined) {
    clearTimeout(crashRestartTimer);
    crashRestartTimer = undefined;
  }
}

function isPhpFileDocument(document) {
  return document !== undefined && document.languageId === "php" && document.uri.scheme === "file";
}

function createPhpDocSemanticTokensProvider() {
  return {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(PHPDOC_SEMANTIC_LEGEND);
      const tokens = collectPhpDocSemanticTokens(document);

      for (const token of tokens) {
        builder.push(token.line, token.start, token.length, token.type, 0);
      }

      return builder.build();
    }
  };
}

function collectPhpDocSemanticTokens(document) {
  const tokens = [];
  let inPhpDoc = false;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const text = document.lineAt(lineNumber).text;
    const openIndex = text.indexOf("/**");
    const closeIndex = text.indexOf("*/");

    if (!inPhpDoc && openIndex === -1) {
      continue;
    }

    if (openIndex !== -1) {
      inPhpDoc = true;
    }

    if (inPhpDoc) {
      collectPhpDocLineSemanticTokens(text, lineNumber, tokens);
    }

    if (closeIndex !== -1) {
      inPhpDoc = false;
    }
  }

  return normalizeSemanticTokens(tokens);
}

function collectPhpDocLineSemanticTokens(text, lineNumber, tokens) {
  const bodyStart = phpDocLineBodyStart(text);
  const bodyEnd = phpDocLineBodyEnd(text);
  let match;

  if (bodyStart >= bodyEnd) {
    return;
  }

  PHPDOC_TYPE_TAG_PATTERN.lastIndex = bodyStart;
  while ((match = PHPDOC_TYPE_TAG_PATTERN.exec(text)) !== null && match.index < bodyEnd) {
    const tagStart = match.index;
    const tagEnd = tagStart + match[0].length;
    const nextTagStart = nextPhpDocTagStart(text, tagEnd, bodyEnd);
    const valueStart = skipWhitespace(text, tagEnd, nextTagStart);
    const typeEnd = phpDocTypeExpressionEnd(text, match[0], valueStart, nextTagStart);

    addSemanticToken(tokens, lineNumber, tagStart, match[0].length, PHPDOC_SEMANTIC_TOKEN.keyword);
    collectPhpDocTypeExpressionSemanticTokens(text, lineNumber, valueStart, typeEnd, tokens);
    PHPDOC_TYPE_TAG_PATTERN.lastIndex = tagEnd;
  }

  PHPDOC_GENERIC_TAG_PATTERN.lastIndex = bodyStart;
  while ((match = PHPDOC_GENERIC_TAG_PATTERN.exec(text)) !== null && match.index < bodyEnd) {
    addSemanticToken(tokens, lineNumber, match.index, match[0].length, PHPDOC_SEMANTIC_TOKEN.keyword);
  }

  collectPhpDocVariables(text, lineNumber, bodyStart, bodyEnd, tokens);
}

function phpDocLineBodyStart(text) {
  const openIndex = text.indexOf("/**");
  let index = openIndex === -1 ? 0 : openIndex + 3;

  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }
  if (text[index] === "*") {
    index++;
    if (text[index] === " ") {
      index++;
    }
  }

  return index;
}

function phpDocLineBodyEnd(text) {
  const closeIndex = text.indexOf("*/");

  return closeIndex === -1 ? text.length : closeIndex;
}

function nextPhpDocTagStart(text, start, end) {
  const tagPattern = /@[A-Za-z][A-Za-z0-9-]*/g;
  let match;

  tagPattern.lastIndex = start;
  match = tagPattern.exec(text);

  return match !== null && match.index < end ? match.index : end;
}

function phpDocTypeExpressionEnd(text, tag, start, end) {
  const normalized = tag.replace(/^@(?:(?:phpstan|psalm)-)?/, "@");
  let variableMatch;

  if (normalized === "@param" || normalized === "@param-out" || normalized === "@property" || normalized === "@property-read" || normalized === "@property-write" || normalized === "@var") {
    variableMatch = /(?:^|\s)(?:\.\.\.)?\$[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(start, end));
    if (variableMatch !== null) {
      return start + variableMatch.index;
    }
  }

  return end;
}

function collectPhpDocTypeExpressionSemanticTokens(text, lineNumber, start, end, tokens) {
  let index = start;

  while (index < end) {
    const char = text[index];

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === "'" || char === "\"") {
      index = collectPhpDocStringSemanticToken(text, lineNumber, index, end, tokens);
      continue;
    }

    if (char === "$") {
      index = collectPhpDocVariableSemanticToken(text, lineNumber, index, end, tokens);
      continue;
    }

    if (/[0-9]/.test(char)) {
      index = collectPhpDocNumberSemanticToken(text, lineNumber, index, end, tokens);
      continue;
    }

    if (/[A-Za-z_\\\\]/.test(char)) {
      index = collectPhpDocIdentifierSemanticToken(text, lineNumber, index, end, tokens);
      continue;
    }

    if (isPhpDocTypeOperator(char)) {
      addSemanticToken(tokens, lineNumber, index, 1, PHPDOC_SEMANTIC_TOKEN.operator);
    }
    index++;
  }
}

function collectPhpDocStringSemanticToken(text, lineNumber, start, end, tokens) {
  const quote = text[start];
  let index = start + 1;

  while (index < end) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === quote) {
      index++;
      break;
    }
    index++;
  }

  addSemanticToken(tokens, lineNumber, start, index - start, phpDocShapeKeySeparatorIndex(text, index, end) !== -1 ? PHPDOC_SEMANTIC_TOKEN.property : PHPDOC_SEMANTIC_TOKEN.string);

  return index;
}

function collectPhpDocVariableSemanticToken(text, lineNumber, start, end, tokens) {
  let index = start + 1;

  while (index < end && /[A-Za-z0-9_]/.test(text[index])) {
    index++;
  }
  if (index > start + 1) {
    addSemanticToken(tokens, lineNumber, start, index - start, PHPDOC_SEMANTIC_TOKEN.parameter);
  }

  return index;
}

function collectPhpDocNumberSemanticToken(text, lineNumber, start, end, tokens) {
  let index = start;

  while (index < end && /[0-9.]/.test(text[index])) {
    index++;
  }
  addSemanticToken(tokens, lineNumber, start, index - start, phpDocShapeKeySeparatorIndex(text, index, end) !== -1 ? PHPDOC_SEMANTIC_TOKEN.property : PHPDOC_SEMANTIC_TOKEN.number);

  return index;
}

function collectPhpDocIdentifierSemanticToken(text, lineNumber, start, end, tokens) {
  let index = start;
  let value, type;

  if (text[index] === "\\") {
    index++;
  }
  while (index < end && /[A-Za-z0-9_\\\\-]/.test(text[index])) {
    index++;
  }
  if (index <= start || index === start + 1 && text[start] === "\\") {
    return start + 1;
  }

  value = text.slice(start, index).replace(/^\\/, "");
  if (phpDocShapeKeySeparatorIndex(text, index, end) !== -1) {
    type = PHPDOC_SEMANTIC_TOKEN.property;
  } else if (PHPDOC_TYPE_KEYWORDS.has(value)) {
    type = PHPDOC_SEMANTIC_TOKEN.keyword;
  } else if (PHPDOC_BUILTIN_TYPES.has(value) || PHPDOC_UTILITY_TYPES.has(value) || /^[A-Z_]/.test(value) || value.includes("\\") || value.includes("-")) {
    type = PHPDOC_SEMANTIC_TOKEN.type;
  } else {
    type = PHPDOC_SEMANTIC_TOKEN.type;
  }
  addSemanticToken(tokens, lineNumber, start, index - start, type);

  return index;
}

function collectPhpDocVariables(text, lineNumber, start, end, tokens) {
  const variablePattern = /\$[A-Za-z_][A-Za-z0-9_]*/g;
  let match;

  variablePattern.lastIndex = start;
  while ((match = variablePattern.exec(text)) !== null && match.index < end) {
    addSemanticToken(tokens, lineNumber, match.index, match[0].length, PHPDOC_SEMANTIC_TOKEN.parameter);
  }
}

function isPhpPropertyDeclarationLine(text) {
  const declarationEnd = text.indexOf(";");
  const blockStart = text.indexOf("{");
  const parenStart = text.indexOf("(");
  const declaration = declarationEnd === -1 ? "" : text.slice(0, declarationEnd);

  if (declarationEnd === -1 || blockStart !== -1 && blockStart < declarationEnd || parenStart !== -1 && parenStart < declarationEnd) {
    return false;
  }

  if (!/^\s*(?:(?:public|protected|private|var|static|readonly)\s+)+/.test(declaration)) {
    return false;
  }

  return !/\b(?:function|const|class|interface|trait|enum)\b/.test(declaration) && /\$[A-Za-z_][A-Za-z0-9_]*/.test(declaration);
}

function updatePhpPropertyDecorations() {
  if (phpPropertyDecorationType === undefined) {
    return;
  }

  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.languageId !== "php") {
      editor.setDecorations(phpPropertyDecorationType, []);
      continue;
    }

    editor.setDecorations(phpPropertyDecorationType, collectPhpPropertyDecorationRanges(editor.document));
  }
}

function collectPhpPropertyDecorationRanges(document) {
  const ranges = [];
  let inPhpDoc = false;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const text = document.lineAt(lineNumber).text;

    if (inPhpDoc || text.includes("/**")) {
      if (!text.includes("*/")) {
        inPhpDoc = true;
        continue;
      }

      inPhpDoc = false;
      continue;
    }

    if (text.trim() === "") {
      continue;
    }

    if (isPhpPropertyDeclarationLine(text)) {
      addPhpPropertyDeclarationDecorationRanges(ranges, lineNumber, text);
    }
  }

  return ranges;
}

function addPhpPropertyDeclarationDecorationRanges(ranges, lineNumber, text) {
  const declarationEnd = text.indexOf(";");
  const declaration = declarationEnd === -1 ? "" : text.slice(0, declarationEnd);
  const variablePattern = /\$[A-Za-z_][A-Za-z0-9_]*/g;
  let match;

  variablePattern.lastIndex = 0;
  while ((match = variablePattern.exec(declaration)) !== null) {
    ranges.push(new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length));
  }
}

function phpDocShapeKeySeparatorIndex(text, start, end) {
  let index = skipWhitespace(text, start, end);

  if (text[index] === "?") {
    index = skipWhitespace(text, index + 1, end);
  }

  if (text[index] === ":" && text[index + 1] !== ":") {
    return index;
  }

  return -1;
}

function isPhpDocTypeOperator(char) {
  return "{}<>[](),:?|&=*".includes(char);
}

function skipWhitespace(text, start, end) {
  let index = start;

  while (index < end && /\s/.test(text[index])) {
    index++;
  }

  return index;
}

function addSemanticToken(tokens, line, start, length, type) {
  if (length <= 0) {
    return;
  }

  tokens.push({ line, start, length, type });
}

function normalizeSemanticTokens(tokens) {
  const sorted = tokens
    .filter((token) => token.length > 0)
    .sort((a, b) => a.line === b.line ? a.start - b.start || b.length - a.length : a.line - b.line);
  const normalized = [];
  let lastLine = -1;
  let lastEnd = 0;

  for (const token of sorted) {
    if (token.line !== lastLine) {
      lastLine = token.line;
      lastEnd = 0;
    }
    if (token.start < lastEnd) {
      continue;
    }
    normalized.push(token);
    lastEnd = token.start + token.length;
  }

  return normalized;
}

function scheduleThisMemberPreload(document) {
  let timer;
  const key = document !== undefined ? document.uri.toString() : "";

  if (!isPhpFileDocument(document)) {
    return;
  }

  timer = preloadThisMemberTimers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    preloadThisMemberTimers.delete(key);
    preloadThisMemberScope(document);
  }, 150);
  preloadThisMemberTimers.set(key, timer);
}

function clearThisMemberPreloadTimer(document) {
  const key = document !== undefined ? document.uri.toString() : "";
  const timer = preloadThisMemberTimers.get(key);

  if (timer === undefined) {
    return;
  }

  clearTimeout(timer);
  preloadThisMemberTimers.delete(key);
}

function clearThisMemberPreloadTimers() {
  for (const timer of preloadThisMemberTimers.values()) {
    clearTimeout(timer);
  }
  preloadThisMemberTimers.clear();
}

async function preloadThisMemberScope(document) {
  if (!isPhpFileDocument(document) || client === undefined || client.state !== State.Running) {
    return;
  }

  try {
    await client.sendRequest("lsparrot.php/preloadThisMembers", {
      textDocument: { uri: document.uri.toString() }
    });
  } catch (error) {
    log("this-member preload failed: " + (error instanceof Error ? error.message : String(error)));
  }
}

function ensureMemberCacheInvalidationWatcher(context) {
  if (memberCacheFileWatcher !== undefined) {
    return;
  }

  memberCacheFileWatcher = vscode.workspace.createFileSystemWatcher("**/*.php");
  memberCacheFileWatcher.onDidCreate(notifyMemberCacheInvalidation, undefined, context.subscriptions);
  memberCacheFileWatcher.onDidChange(notifyMemberCacheInvalidation, undefined, context.subscriptions);
  memberCacheFileWatcher.onDidDelete(notifyMemberCacheInvalidation, undefined, context.subscriptions);
  context.subscriptions.push(memberCacheFileWatcher);
}

function notifyMemberCacheInvalidation(uri) {
  if (client === undefined || client.state !== State.Running) {
    return;
  }

  client.sendNotification("lsparrot.php/invalidateMemberCache", {
    uri: uri !== undefined ? uri.toString() : undefined
  }).catch((error) => {
    log("member cache invalidation failed: " + (error instanceof Error ? error.message : String(error)));
  });
}

async function selectAnalyzerMode() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const projectRoot = resolveActiveComposerProjectRoot();
  const projectConfig = readProjectVscodeConfig(projectRoot);
  const currentSetting = normalizeAnalyzer(projectAdditionalAnalyzerValue(projectConfig, config.get("additionalAnalyzer", [])));
  const items = analyzerModeQuickPickItems(currentSetting, projectRoot);
  const selected = await showAnalyzerBackendQuickPick(items);

  if (selected === undefined) {
    return;
  }

  const nextValue = selectedAnalyzerValue(selected);
  if (sameAnalyzerSelection(currentSetting, nextValue, projectRoot)) {
    vscode.window.showInformationMessage(localize("selectAnalyzer.alreadySelected", {
      mode: formatAnalyzerSelectionName(nextValue)
    }));
    return;
  }

  if (projectRoot !== "") {
    writeProjectVscodeConfig(projectRoot, mergeProjectVscodeConfig(projectConfig, { additionalAnalyzer: nextValue }));
  } else {
    const target = vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await config.update("additionalAnalyzer", nextValue, target);
  }
  vscode.window.showInformationMessage(localize("selectAnalyzer.changed", {
    mode: formatAnalyzerSelectionName(nextValue)
  }));
  if (projectRoot !== "") {
    await restart();
  }
}

function showAnalyzerBackendQuickPick(items) {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick();
    const placeHolder = localize("selectAnalyzer.placeHolder");
    let accepted = false;
    let updatingSelection = false;

    quickPick.title = localize("selectAnalyzer.title");
    quickPick.placeholder = placeHolder;
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = items;
    quickPick.selectedItems = items.filter((item) => item.picked && item.available);

    quickPick.onDidChangeSelection((selection) => {
      const selectedItems = Array.from(selection);
      const allowedItems = selectedItems.filter((item) => item.available);
      const blockedItem = selectedItems.find((item) => !item.available);

      if (updatingSelection) {
        return;
      }
      if (blockedItem !== undefined) {
        updatingSelection = true;
        quickPick.selectedItems = allowedItems;
        quickPick.placeholder = localize("selectAnalyzer.installRequired", { mode: blockedItem.modeLabel || blockedItem.label });
        updatingSelection = false;
      } else {
        quickPick.placeholder = placeHolder;
      }
    });

    quickPick.onDidAccept(() => {
      accepted = true;
      resolve(Array.from(quickPick.selectedItems).filter((item) => item.available));
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      if (!accepted) {
        resolve(undefined);
      }
      quickPick.dispose();
    });

    quickPick.show();
  });
}

function analyzerModeQuickPickItems(currentSetting, projectRoot) {
  return analyzerModesForProject(projectRoot).map((mode) => {
    return analyzerModeQuickPickItem(currentSetting, mode);
  });
}

function analyzerModeQuickPickItem(currentSetting, mode) {
  const selected = mode.available && analyzerModeIsSelected(currentSetting, mode.value, mode.available);
  if (!mode.available) {
    const unavailableKey = typeof mode.unavailableKey === "string" && mode.unavailableKey !== "" ? mode.unavailableKey : "selectAnalyzer.installRequired";

    return {
      label: "$(circle-slash) " + mode.label,
      description: localize("selectAnalyzer.unavailable"),
      detail: localize(unavailableKey, { mode: mode.label }),
      modeLabel: mode.label,
      value: mode.value,
      available: false,
      picked: false,
      alwaysShow: true
    };
  }

  return {
    label: mode.label,
    description: selected ? localize("selectAnalyzer.current") : localize(mode.descriptionKey),
    detail: localize(mode.detailKey),
    value: mode.value,
    available: true,
    picked: selected
  };
}

function analyzerModesForProject(projectRoot) {
  const phpstanAvailable = projectAnalyzerExists(projectRoot, "phpstan");
  const psalmInstalled = projectAnalyzerExists(projectRoot, "psalm");
  const psalmLsInstalled = projectAnalyzerExists(projectRoot, "psalm-ls");

  return [
    { value: "phpstan", label: "PHPStan", available: phpstanAvailable, descriptionKey: "selectAnalyzer.phpstan.description", detailKey: "selectAnalyzer.phpstan.detail" },
    { value: "psalm", label: "Psalm", available: psalmInstalled, descriptionKey: "selectAnalyzer.psalm.description", detailKey: "selectAnalyzer.psalm.detail" },
    { value: "psalm-ls", label: "Psalm LS", available: psalmLsInstalled, descriptionKey: "selectAnalyzer.psalmLs.description", detailKey: "selectAnalyzer.psalmLs.detail" }
  ];
}

async function requestServerStatus() {
  if (client === undefined || client.state !== State.Running) {
    return {};
  }

  try {
    return await client.sendRequest("lsparrot.php/status", {});
  } catch (error) {
    log("status request failed: " + (error instanceof Error ? error.message : String(error)));
    return {};
  }
}

function startStatusPolling() {
  if (statusPollTimer !== undefined) {
    return;
  }

  refreshServerStatus();
  statusPollTimer = setInterval(refreshServerStatus, 3000);
}

function clearStatusPolling() {
  if (statusPollTimer !== undefined) {
    clearInterval(statusPollTimer);
    statusPollTimer = undefined;
  }
  currentServerStatus = {};
}

async function refreshServerStatus() {
  const results = await Promise.allSettled([
    requestServerStatus(),
    collectRelatedProcessMetrics()
  ]);

  if (results[0].status === "fulfilled") {
    currentServerStatus = results[0].value;
  }
  if (results[1].status === "fulfilled") {
    currentProcessMetrics = results[1].value;
  }
  setStatus(currentStatusState, currentStatusTooltip);
}

function updateProcessMetricsSoon() {
  collectRelatedProcessMetrics().then((metrics) => {
    currentProcessMetrics = metrics;
    setStatus(currentStatusState, currentStatusTooltip);
  }, (error) => {
    log("process metrics failed: " + (error instanceof Error ? error.message : String(error)));
  });
}

function searchWorkspaceSymbols() {
  if (client === undefined || client.state !== State.Running) {
    vscode.window.showWarningMessage(localize("symbolSearch.noServer"));
    return;
  }

  const quickPick = vscode.window.createQuickPick();
  const disposables = [];
  let searchTimer;
  let searchVersion = 0;

  quickPick.title = localize("symbolSearch.title");
  quickPick.placeholder = localize("symbolSearch.placeHolder");
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  const update = (query) => {
    if (searchTimer !== undefined) {
      clearTimeout(searchTimer);
    }

    searchTimer = setTimeout(async () => {
      const version = ++searchVersion;
      quickPick.busy = true;
      try {
        const symbols = await requestPhpWorkspaceSymbols(query);
        if (version !== searchVersion) {
          return;
        }

        const symbolItems = workspaceSymbolQuickPickItems(Array.isArray(symbols) ? symbols : []);
        quickPick.items = [...symbolItems, terminalQuickPickItem()];
        quickPick.placeholder = symbolItems.length === 0 ? localize("symbolSearch.noSymbols") : localize("symbolSearch.placeHolder");
      } catch (error) {
        log("workspace symbol search failed: " + (error instanceof Error ? error.message : String(error)));
        if (version === searchVersion) {
          quickPick.items = [terminalQuickPickItem()];
          quickPick.placeholder = localize("symbolSearch.noSymbols");
        }
      } finally {
        if (version === searchVersion) {
          quickPick.busy = false;
        }
      }
    }, query === "" ? 0 : 120);
  };

  disposables.push(quickPick.onDidChangeValue(update));
  disposables.push(quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    if (selected === undefined) {
      return;
    }

    quickPick.hide();
    if (selected.command === "terminal") {
      openFuzzyFinderTerminal();
      return;
    }
    if (selected.symbol === undefined) {
      return;
    }

    await openWorkspaceSymbol(selected.symbol);
  }));
  disposables.push(quickPick.onDidHide(() => {
    if (searchTimer !== undefined) {
      clearTimeout(searchTimer);
    }
    for (const disposable of disposables) {
      disposable.dispose();
    }
    quickPick.dispose();
  }));

  update("");
  quickPick.show();
}

async function requestPhpWorkspaceSymbols(query) {
  const response = await client.sendRequest("workspace/symbol", { query });
  if (!Array.isArray(response)) {
    return [];
  }

  if (client.protocol2CodeConverter && typeof client.protocol2CodeConverter.asSymbolInformations === "function") {
    const converted = await client.protocol2CodeConverter.asSymbolInformations(response);
    return Array.isArray(converted) ? converted.filter(isPhpWorkspaceSymbol) : [];
  }

  return response.map(normalizeProtocolWorkspaceSymbol).filter(isPhpWorkspaceSymbol);
}

function terminalQuickPickItem() {
  return {
    label: "$(terminal) terminal",
    description: localize("symbolSearch.terminal.description"),
    detail: localize("symbolSearch.terminal.detail"),
    command: "terminal"
  };
}

function workspaceSymbolQuickPickItems(symbols) {
  return symbols.filter(isPhpWorkspaceSymbol).slice(0, 1000).map((symbol) => {
    const location = symbol.location;
    const range = location && location.range ? location.range : undefined;
    const uri = location && location.uri ? location.uri : undefined;
    const line = range && range.start ? range.start.line + 1 : 1;
    const detail = uri ? uri.fsPath + ":" + line : "";
    const kindName = symbolKindName(symbol.kind);
    const description = symbol.containerName && symbol.containerName !== "" ? symbol.containerName : kindName;

    return {
      label: symbolKindIcon(symbol.kind) + " " + symbol.name,
      description,
      detail,
      symbol
    };
  });
}

function normalizeProtocolWorkspaceSymbol(symbol) {
  const location = symbol.location || {};
  const uri = typeof location.uri === "string" ? vscode.Uri.parse(location.uri) : location.uri;
  const range = location.range ? new vscode.Range(
    new vscode.Position(location.range.start.line, location.range.start.character),
    new vscode.Position(location.range.end.line, location.range.end.character)
  ) : new vscode.Range(0, 0, 0, 0);

  return {
    name: symbol.name || "",
    kind: typeof symbol.kind === "number" ? symbol.kind - 1 : symbol.kind,
    containerName: symbol.containerName || "",
    location: {
      uri,
      range
    }
  };
}

function isPhpWorkspaceSymbol(symbol) {
  if (!symbol || !symbol.location || !symbol.location.uri) {
    return false;
  }

  const uri = symbol.location.uri;
  if (uri.scheme !== "file") {
    return false;
  }

  const filePath = uri.fsPath || "";
  return isPhpCandidatePath(filePath);
}

function isAnalysisHelperPath(filePath) {
  const parts = filePath.split(/[\\/]+/u);

  return parts.includes(".lsparrot");
}

function isPhpCandidatePath(filePath) {
  if (filePath === "" || isAnalysisHelperPath(filePath)) {
    return false;
  }

  return filePath.endsWith(".php") || filePath.endsWith(".phtml") || filePath.endsWith(".inc");
}

async function openWorkspaceSymbol(symbol) {
  if (!symbol.location || !symbol.location.uri) {
    return;
  }

  const range = symbol.location.range || new vscode.Range(0, 0, 0, 0);
  const position = range.start || new vscode.Position(0, 0);
  await vscode.window.showTextDocument(symbol.location.uri, {
    selection: new vscode.Range(position, position),
    preview: true
  });
}

function openFuzzyFinderTerminal() {
  const cwd = currentWorkspaceRoot !== "" ? currentWorkspaceRoot : resolveWorkspaceRoot(extensionContext || { extensionPath: process.cwd() });
  vscode.window.createTerminal({ cwd }).show();
}

async function findMethodByNameCommand() {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined || editor.document.languageId !== "php") {
    vscode.window.showInformationMessage(localize("methodSearch.noMethod"));
    return;
  }

  const range = editor.document.getWordRangeAtPosition(editor.selection.active, /[A-Za-z_][A-Za-z0-9_]*/);
  if (range === undefined) {
    vscode.window.showInformationMessage(localize("methodSearch.noMethod"));
    return;
  }

  const methodName = editor.document.getText(range);
  const items = await findMethodDefinitionsByName(methodName);
  if (items.length === 0) {
    vscode.window.showInformationMessage(localize("methodSearch.noMatches"));
    return;
  }

  const selected = await vscode.window.showQuickPick(items, {
    title: localize("methodSearch.title"),
    placeHolder: localize("methodSearch.placeHolder"),
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected && selected.location) {
    await openLocation(selected.location);
  }
}

function createFallbackMethodDefinitionProvider() {
  return {
    async provideDefinition(document, position, token) {
      if (client === undefined || client.state !== State.Running || document.languageId !== "php" || isAnalysisHelperPath(document.uri.fsPath)) {
        return undefined;
      }

      const methodName = methodNameAtCallPosition(document, position);
      if (methodName === "") {
        return undefined;
      }

      const primary = await requestPrimaryDefinition(document, position, token);
      if (hasDefinitionResult(primary)) {
        return undefined;
      }

      const items = await findMethodDefinitionsByName(methodName, token);
      if (token.isCancellationRequested || items.length === 0) {
        return undefined;
      }

      return items.map((item) => item.location).filter(Boolean);
    }
  };
}

function methodNameAtCallPosition(document, position) {
  const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
  if (range === undefined) {
    return "";
  }

  const word = document.getText(range);
  const line = document.lineAt(range.start.line).text;
  const before = line.slice(0, range.start.character).replace(/\s+$/u, "");
  const after = line.slice(range.end.character).replace(/^\s+/u, "");
  if (!after.startsWith("(")) {
    return "";
  }
  if (!before.endsWith("->") && !before.endsWith("?->") && !before.endsWith("::")) {
    return "";
  }

  return word;
}

async function requestPrimaryDefinition(document, position, token) {
  try {
    return await client.sendRequest("textDocument/definition", {
      textDocument: { uri: document.uri.toString() },
      position: { line: position.line, character: position.character }
    }, token);
  } catch (error) {
    log("primary definition request failed: " + (error instanceof Error ? error.message : String(error)));
    return undefined;
  }
}

function hasDefinitionResult(result) {
  if (result === undefined || result === null) {
    return false;
  }
  if (Array.isArray(result)) {
    return result.length > 0;
  }
  return typeof result === "object" && (typeof result.uri === "string" || typeof result.targetUri === "string");
}

async function findMethodDefinitionsByName(methodName, token) {
  const uris = await vscode.workspace.findFiles("**/*.php", "{**/vendor/**,**/.git/**,**/.lsparrot/**}", 3000);
  const vendorUris = await vscode.workspace.findFiles("**/vendor/**/*.php", "{**/.git/**,**/.lsparrot/**}", 1000);
  const items = [];

  for (const uri of [...uris, ...vendorUris]) {
    if (token && token.isCancellationRequested) {
      return [];
    }
    if (!isPhpCandidatePath(uri.fsPath)) {
      continue;
    }
    const matches = await scanMethodDefinitionsInUri(uri, methodName);
    for (const match of matches) {
      items.push(methodDefinitionQuickPickItem(match, uri.fsPath.includes(path.sep + "vendor" + path.sep)));
    }
  }

  return items.sort((a, b) => Number(a.vendor) - Number(b.vendor) || a.label.localeCompare(b.label));
}

async function scanMethodDefinitionsInUri(uri, methodName) {
  let text;
  try {
    text = await fs.promises.readFile(uri.fsPath, "utf8");
  } catch (_error) {
    return [];
  }

  const escaped = escapeRegExp(methodName);
  const regex = new RegExp("\\bfunction\\s+" + escaped + "\\s*\\(", "g");
  const matches = [];
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    const position = positionAtTextOffset(text, match.index);
    const className = enclosingClassNameBeforeOffset(text, match.index);
    matches.push({
      name: methodName,
      className,
      uri,
      range: new vscode.Range(position, position)
    });
  }

  return matches;
}

function methodDefinitionQuickPickItem(match, vendor) {
  const line = match.range.start.line + 1;
  const owner = match.className !== "" ? match.className : "(global)";
  return {
    label: "$(symbol-method) " + owner + "::" + match.name,
    description: vendor ? "vendor" : "project",
    detail: match.uri.fsPath + ":" + line,
    location: new vscode.Location(match.uri, match.range),
    vendor
  };
}

function createPhpCodeLensProvider() {
  return {
    onDidChangeCodeLenses: codeLensEmitter.event,
    async provideCodeLenses(document, token) {
      if (document.languageId !== "php" || isAnalysisHelperPath(document.uri.fsPath)) {
        return [];
      }

      const structure = parsePhpStructure(document);
      const lenses = [];
      const descendantTargets = structure.classes
        .filter(classInfoCanHaveExtenders)
        .map((classInfo) => classInfo.fqcn);
      const descendantMap = ensureClassDescendantsCached(descendantTargets);
      for (const classInfo of structure.classes) {
        const extendsParents = classInfo.parents.filter((parent) => parent.kind === "extends");
        if (extendsParents.length > 0) {
          lenses.push(new vscode.CodeLens(classInfo.range, {
            title: "$(type-hierarchy-super) " + localize("codeLens.extendTree"),
            command: "lsparrot.showExtendTree",
            arguments: [document.uri.toString(), classInfo.fqcn]
          }));
        }

        const descendants = classInfoCanHaveExtenders(classInfo) && descendantMap !== undefined
          ? descendantMap.get(classInfo.fqcn.toLowerCase()) || emptyClassDescendants()
          : emptyClassDescendants();
        if (descendants.extends.length > 0) {
          lenses.push(new vscode.CodeLens(classInfo.range, {
            title: "$(type-hierarchy-sub) " + localize("codeLens.extendsBy"),
            command: "lsparrot.showClassRelations",
            arguments: [document.uri.toString(), classInfo.name, "extendedBy", descendants.extends]
          }));
        }
        if (descendants.implements.length > 0) {
          lenses.push(new vscode.CodeLens(classInfo.range, {
            title: "$(references) " + localize("codeLens.implementedBy"),
            command: "lsparrot.showClassRelations",
            arguments: [document.uri.toString(), classInfo.name, "implementedBy", descendants.implements]
          }));
        }
      }

      if (client === undefined || client.state !== State.Running) {
        return lenses;
      }

      for (const classInfo of structure.classes) {
        const extendsParents = classInfo.parents.filter((parent) => parent.kind === "extends");
        const parent = extendsParents[0];
        if (!parent) {
          continue;
        }

        let parentSymbol;
        try {
          parentSymbol = await findClassSymbol(parent.fqcn, token);
        } catch (error) {
          log("override target search failed: " + (error instanceof Error ? error.message : String(error)));
          continue;
        }
        if (!parentSymbol || (token && token.isCancellationRequested)) {
          continue;
        }
        let parentMethods;
        try {
          parentMethods = await methodSetForClassSymbol(parentSymbol, parent.fqcn);
        } catch (error) {
          log("override method search failed: " + (error instanceof Error ? error.message : String(error)));
          continue;
        }
        for (const method of classInfo.methods) {
          const target = parentMethods.get(method.name.toLowerCase());
          if (!target) {
            continue;
          }
          lenses.push(new vscode.CodeLens(method.range, {
            title: "$(go-to-file) " + localize("codeLens.override"),
            command: "lsparrot.goToOverrideTarget",
            arguments: [target]
          }));
        }
      }

      return lenses;
    }
  };
}

async function showClassSupertypesCommand(documentUriText, className) {
  return showClassRelationsCommand(documentUriText, className, "supertypes");
}

async function showClassRelationsCommand(documentUriText, className, relationKind, precomputedItems) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUriText));
  const structure = parsePhpStructure(document);
  const classInfo = structure.classes.find((candidate) => candidate.name === className);
  if (!classInfo) {
    vscode.window.showInformationMessage(localize("codeLens.noTargets"));
    return;
  }

  const items = Array.isArray(precomputedItems) ? precomputedItems : await classRelationItems(classInfo, relationKind);

  if (items.length === 0) {
    vscode.window.showInformationMessage(localize("codeLens.noTargets"));
    return;
  }

  const selected = await vscode.window.showQuickPick(items, {
    title: classRelationTitle(relationKind),
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected && selected.location) {
    await openLocation(selected.location);
  }
}

async function classRelationItems(classInfo, relationKind) {
  if (relationKind === "extendedBy" || relationKind === "implementedBy") {
    const descendants = await findClassDescendants(classInfo.fqcn);
    return relationKind === "extendedBy" ? descendants.extends : descendants.implements;
  }

  const parents = relationKind === "extends"
    ? classInfo.parents.filter((parent) => parent.kind === "extends")
    : relationKind === "implements"
      ? classInfo.parents.filter((parent) => parent.kind === "implements")
      : classInfo.parents;
  const items = [];
  for (const parent of parents) {
    const symbol = await findClassSymbol(parent.fqcn);
    if (!symbol || !symbol.location) {
      continue;
    }
    items.push({
      label: symbolKindIcon(symbol.kind) + " " + parent.fqcn,
      description: localize(parent.kind === "implements" ? "codeLens.implements" : "codeLens.extends"),
      detail: symbol.location.uri.fsPath,
      location: symbol.location
    });
  }
  return items;
}

function classRelationTitle(relationKind) {
  switch (relationKind) {
    case "extends":
      return localize("codeLens.extends");
    case "implements":
      return localize("codeLens.implements");
    case "extendedBy":
      return localize("codeLens.extendsBy");
    case "implementedBy":
      return localize("codeLens.implementedBy");
    default:
      return localize("codeLens.extends") + " / " + localize("codeLens.implements");
  }
}

async function showExtendTreeCommand(documentUriText, className) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUriText));
  const structure = parsePhpStructure(document);
  const classInfo = structure.classes.find((candidate) => candidate.fqcn === className || candidate.name === className);
  if (!classInfo) {
    vscode.window.showInformationMessage(localize("codeLens.noTargets"));
    return;
  }

  const items = await extendTreeItems(classInfo);
  if (items.length === 0) {
    vscode.window.showInformationMessage(localize("codeLens.noTargets"));
    return;
  }

  const selected = await vscode.window.showQuickPick(items, {
    title: localize("codeLens.extendTree"),
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected && selected.location) {
    await openLocation(selected.location);
  }
}

async function extendTreeItems(classInfo, token) {
  const items = [];
  const visited = new Set([classInfo.fqcn.toLowerCase()]);
  const parents = classInfo.parents.filter((parent) => parent.kind === "extends");

  for (const parent of parents) {
    await addExtendTreeParentItems(items, parent, 0, visited, token);
  }

  return items;
}

async function addExtendTreeParentItems(items, parent, depth, visited, token) {
  const key = parent.fqcn.toLowerCase();
  let symbol, resolved, location;

  if (token && token.isCancellationRequested) {
    return;
  }

  if (visited.has(key)) {
    return;
  }
  visited.add(key);

  symbol = await findClassSymbol(parent.fqcn, token);
  if (!symbol || !symbol.location) {
    return;
  }

  resolved = await classInfoForSymbol(symbol, parent.fqcn);
  location = resolved
    ? new vscode.Location(resolved.document.uri, resolved.classInfo.range)
    : symbol.location;

  items.push({
    label: symbolKindIcon(symbol.kind) + " " + extendTreeIndent(depth) + basenameFromFqcn(parent.fqcn),
    description: parent.fqcn,
    detail: location.uri.fsPath,
    location
  });

  if (!resolved) {
    return;
  }

  for (const nextParent of resolved.classInfo.parents.filter((candidate) => candidate.kind === "extends")) {
    await addExtendTreeParentItems(items, nextParent, depth + 1, visited, token);
  }
}

function extendTreeIndent(depth) {
  return depth > 0 ? "  ".repeat(depth) : "";
}

async function goToOverrideTargetCommand(target) {
  if (target) {
    await openLocation(target);
  }
}

async function showReferencesCommand(documentUriValue, positionValue, locationValues) {
  const documentUri = vscodeUriFromValue(documentUriValue);
  const position = vscodePositionFromValue(positionValue);
  const locations = Array.isArray(locationValues)
    ? locationValues.map(vscodeLocationFromValue).filter(Boolean)
    : [];

  if (!documentUri || !position || locations.length === 0) {
    vscode.window.showInformationMessage(localize("codeLens.noTargets"));
    return;
  }

  await vscode.commands.executeCommand("editor.action.showReferences", documentUri, position, locations);
}

function vscodeUriFromValue(value) {
  if (value instanceof vscode.Uri) {
    return value;
  }
  if (typeof value === "string" && value !== "") {
    return vscode.Uri.parse(value);
  }
  return undefined;
}

function vscodePositionFromValue(value) {
  if (value instanceof vscode.Position) {
    return value;
  }
  if (!value || typeof value.line !== "number" || typeof value.character !== "number") {
    return undefined;
  }
  return new vscode.Position(value.line, value.character);
}

function vscodeRangeFromValue(value) {
  const start = value && vscodePositionFromValue(value.start);
  const end = value && vscodePositionFromValue(value.end);
  if (!start || !end) {
    return undefined;
  }
  return new vscode.Range(start, end);
}

function vscodeLocationFromValue(value) {
  const uri = value && vscodeUriFromValue(value.uri);
  const range = value && vscodeRangeFromValue(value.range);
  if (!uri || !range) {
    return undefined;
  }
  return new vscode.Location(uri, range);
}

function fireCodeLensChanged() {
  if (codeLensEmitter !== undefined) {
    codeLensEmitter.fire();
  }
}

function resetClassDescendantCache() {
  classDescendantCache.clear();
  classDescendantPending.clear();
  classDescendantCacheGeneration++;
  fireCodeLensChanged();
}

function classDescendantCacheKey(fqcns) {
  return fqcns
    .filter((fqcn) => typeof fqcn === "string" && fqcn !== "")
    .map((fqcn) => fqcn.toLowerCase())
    .sort()
    .join("\n");
}

function ensureClassDescendantsCached(fqcns) {
  const key = classDescendantCacheKey(fqcns);
  if (key === "") {
    return new Map();
  }
  if (classDescendantCache.has(key)) {
    return classDescendantCache.get(key);
  }
  if (client === undefined || client.state !== State.Running || classDescendantPending.has(key)) {
    return undefined;
  }

  const generation = classDescendantCacheGeneration;
  classDescendantPending.add(key);
  findClassDescendantsForTargets(fqcns)
    .then((descendants) => {
      if (generation === classDescendantCacheGeneration) {
        classDescendantCache.set(key, descendants);
      }
    })
    .catch((error) => {
      log("class descendant cache failed: " + (error instanceof Error ? error.message : String(error)));
    })
    .finally(() => {
      classDescendantPending.delete(key);
      fireCodeLensChanged();
    });

  return undefined;
}

async function findClassSymbol(fqcn, token) {
  if (token && token.isCancellationRequested) {
    return undefined;
  }

  const basename = fqcn.split("\\").pop() || fqcn;
  const symbols = await requestPhpWorkspaceSymbols(basename);
  return symbols.find((symbol) => symbol.name === fqcn) ||
    symbols.find((symbol) => symbol.name.endsWith("\\" + basename) || symbol.name === basename);
}

async function classInfoForSymbol(symbol, fqcn) {
  const basename = basenameFromFqcn(fqcn);
  let document, structure, classInfo;

  if (!symbol || !symbol.location || !symbol.location.uri) {
    return undefined;
  }

  document = await vscode.workspace.openTextDocument(symbol.location.uri);
  structure = parsePhpStructure(document);
  classInfo = structure.classes.find((candidate) => candidate.fqcn === fqcn || candidate.name === basename);
  if (!classInfo) {
    return undefined;
  }

  return { document, classInfo };
}

async function findClassDescendants(fqcn, token) {
  const map = await findClassDescendantsForTargets([fqcn], token);
  return map.get(fqcn.toLowerCase()) || emptyClassDescendants();
}

async function findClassDescendantsForTargets(fqcns, token) {
  const targets = new Map();
  const targetKeys = new Set();
  const extendsChildren = new Map();
  for (const fqcn of fqcns) {
    if (typeof fqcn !== "string" || fqcn === "") {
      continue;
    }
    const key = fqcn.toLowerCase();
    targetKeys.add(key);
    targets.set(key, emptyClassDescendants());
  }
  if (token && token.isCancellationRequested) {
    return targets;
  }

  let symbols;
  try {
    symbols = await requestPhpWorkspaceSymbols("");
  } catch (error) {
    log("class descendant search failed: " + (error instanceof Error ? error.message : String(error)));
    return targets;
  }
  for (const symbol of symbols) {
    if (token && token.isCancellationRequested) {
      return targets;
    }
    if (!symbol.location || !symbol.location.uri || !phpClassSymbolKind(symbol.kind)) {
      continue;
    }

    let document;
    try {
      document = await vscode.workspace.openTextDocument(symbol.location.uri);
    } catch (_error) {
      continue;
    }

    const structure = parsePhpStructure(document);
    const candidate = structure.classes.find((classInfo) => classInfo.fqcn === symbol.name || classInfo.name === basenameFromFqcn(symbol.name));
    if (!candidate) {
      continue;
    }

    for (const parent of candidate.parents) {
      if (parent.kind === "extends") {
        addExtendsChild(extendsChildren, parent.fqcn, candidate, document.uri);
      }

      if (parent.kind === "implements") {
        const bucket = targets.get(parent.fqcn.toLowerCase());
        if (bucket === undefined) {
          continue;
        }

        bucket.implements.push(classRelationQuickPickItem(candidate, document.uri, parent.kind, 0));
      }
    }
  }

  for (const key of targetKeys) {
    const descendants = targets.get(key);
    if (descendants !== undefined) {
      addExtendsDescendantItems(descendants.extends, extendsChildren, key, 0, new Set([key]));
    }
  }

  for (const descendants of targets.values()) {
    descendants.implements.sort(classRelationItemCompare);
  }
  return targets;
}

function addExtendsChild(extendsChildren, parentFqcn, classInfo, uri) {
  const key = parentFqcn.toLowerCase();
  let children = extendsChildren.get(key);

  if (children === undefined) {
    children = [];
    extendsChildren.set(key, children);
  }

  children.push({ classInfo, uri });
}

function addExtendsDescendantItems(items, extendsChildren, parentKey, depth, visited) {
  const children = extendsChildren.get(parentKey) || [];

  children.sort((left, right) => left.classInfo.fqcn.localeCompare(right.classInfo.fqcn));
  for (const child of children) {
    const childKey = child.classInfo.fqcn.toLowerCase();
    if (visited.has(childKey)) {
      continue;
    }

    visited.add(childKey);
    items.push(classRelationQuickPickItem(child.classInfo, child.uri, "extends", depth));
    addExtendsDescendantItems(items, extendsChildren, childKey, depth + 1, visited);
  }
}

function emptyClassDescendants() {
  return { extends: [], implements: [] };
}

function classRelationQuickPickItem(classInfo, uri, relationKind, depth) {
  const fqcn = classInfo.fqcn;
  return {
    label: symbolKindIcon(classKindToSymbolKind(classInfo.kind)) + " " + extendTreeIndent(depth || 0) + basenameFromFqcn(fqcn),
    description: fqcn,
    picked: false,
    fqcn,
    detail: uri.fsPath,
    location: new vscode.Location(uri, classInfo.range)
  };
}

function classRelationItemCompare(left, right) {
  return (left.fqcn || left.label).localeCompare(right.fqcn || right.label);
}

function classInfoCanHaveExtenders(classInfo) {
  return (classInfo.kind === "class" && classInfo.isFinal !== true) || classInfo.kind === "interface";
}

function phpClassSymbolKind(kind) {
  return kind === vscode.SymbolKind.Class ||
    kind === vscode.SymbolKind.Interface ||
    kind === vscode.SymbolKind.Enum ||
    kind === vscode.SymbolKind.Struct;
}

function classKindToSymbolKind(kind) {
  if (kind === "interface") {
    return vscode.SymbolKind.Interface;
  }
  if (kind === "enum") {
    return vscode.SymbolKind.Enum;
  }
  return vscode.SymbolKind.Class;
}

function basenameFromFqcn(fqcn) {
  return fqcn.split("\\").pop() || fqcn;
}

async function methodSetForClassSymbol(symbol, fqcn) {
  const resolved = await classInfoForSymbol(symbol, fqcn);
  const map = new Map();
  if (!resolved) {
    return map;
  }
  for (const method of resolved.classInfo.methods) {
    map.set(method.name.toLowerCase(), new vscode.Location(resolved.document.uri, method.range));
  }
  return map;
}

function parsePhpStructure(document) {
  const text = document.getText();
  const namespace = phpNamespace(text);
  const imports = phpImports(text);
  const classes = [];
  const classRegex = /\b(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

  for (let match = classRegex.exec(text); match !== null; match = classRegex.exec(text)) {
    const headerStart = match.index;
    const isFinal = /\bfinal\b/i.test(match[0].slice(0, match[0].indexOf(match[1])));
    const openBrace = text.indexOf("{", classRegex.lastIndex);
    if (openBrace < 0) {
      continue;
    }
    const closeBrace = matchingBraceOffset(text, openBrace);
    if (closeBrace < 0) {
      continue;
    }

    const name = match[2];
    const header = text.slice(classRegex.lastIndex, openBrace);
    const range = new vscode.Range(document.positionAt(headerStart), document.positionAt(headerStart));
    const parents = phpClassParents(header, namespace, imports);
    const methods = phpMethodsInRange(document, text, openBrace, closeBrace);
    const properties = phpPropertiesInRange(document, text, openBrace, closeBrace);
    classes.push({
      kind: match[1],
      name,
      fqcn: namespace === "" ? name : namespace + "\\" + name,
      isFinal,
      range,
      parents,
      methods,
      properties,
      openBrace,
      closeBrace
    });
    classRegex.lastIndex = closeBrace + 1;
  }

  return { namespace, imports, classes };
}

function phpNamespace(text) {
  const match = text.match(/\bnamespace\s+([^;{]+)[;{]/);
  return match ? match[1].trim().replace(/^\\/, "") : "";
}

function phpImports(text) {
  const imports = new Map();
  const regex = /^\s*use\s+(?!function\b|const\b)([^;]+);/gm;
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    for (const rawPart of match[1].split(",")) {
      const part = rawPart.trim();
      if (part === "" || part.includes("{")) {
        continue;
      }
      const aliasMatch = part.match(/\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
      const fqcn = part.replace(/\s+as\s+[A-Za-z_][A-Za-z0-9_]*$/i, "").trim().replace(/^\\/, "");
      const alias = aliasMatch ? aliasMatch[1] : (fqcn.split("\\").pop() || fqcn);
      imports.set(alias.toLowerCase(), fqcn);
    }
  }
  return imports;
}

function phpClassParents(header, namespace, imports) {
  const parents = [];
  const extendsMatch = header.match(/\bextends\s+(.+?)(?=\bimplements\b|$)/s);
  const implementsMatch = header.match(/\bimplements\s+(.+)$/s);
  if (extendsMatch) {
    for (const name of phpTypeList(extendsMatch[1])) {
      parents.push({ kind: "extends", fqcn: resolvePhpTypeName(name, namespace, imports) });
    }
  }
  if (implementsMatch) {
    for (const name of phpTypeList(implementsMatch[1])) {
      parents.push({ kind: "implements", fqcn: resolvePhpTypeName(name, namespace, imports) });
    }
  }
  return parents;
}

function phpTypeList(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => part.replace(/[^\w\\].*$/, ""));
}

function resolvePhpTypeName(name, namespace, imports) {
  const clean = name.trim().replace(/^\\/, "");
  if (clean.includes("\\")) {
    const [head, ...tail] = clean.split("\\");
    const imported = imports.get(head.toLowerCase());
    return imported ? [imported, ...tail].join("\\") : clean;
  }

  const imported = imports.get(clean.toLowerCase());
  if (imported) {
    return imported;
  }

  return namespace === "" ? clean : namespace + "\\" + clean;
}

function phpMethodsInRange(document, text, openBrace, closeBrace) {
  const methods = [];
  const regex = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  regex.lastIndex = openBrace + 1;
  for (let match = regex.exec(text); match !== null && match.index < closeBrace; match = regex.exec(text)) {
    const position = document.positionAt(match.index);
    methods.push({
      name: match[1],
      range: new vscode.Range(position, position)
    });
  }
  return methods;
}

function phpPropertiesInRange(document, text, openBrace, closeBrace) {
  const properties = [];
  const slice = text.slice(openBrace + 1, closeBrace);
  const regex = /^\s*((?:(?:public|protected|private|var|static|readonly)\s+)+)(?:(\??[A-Za-z_\\\\][A-Za-z0-9_\\\\]*(?:\s*[|&]\s*\??[A-Za-z_\\\\][A-Za-z0-9_\\\\]*)*)\s+)?\$([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  let match;

  for (match = regex.exec(slice); match !== null; match = regex.exec(slice)) {
    const absolute = openBrace + 1 + match.index;
    const modifiers = match[1].trim().split(/\s+/u);
    const type = typeof match[2] === "string" ? match[2].replace(/\s+/gu, "") : "";
    const name = match[3];

    if (modifiers.includes("static")) {
      continue;
    }

    properties.push({
      name,
      type,
      readonly: modifiers.includes("readonly"),
      range: new vscode.Range(document.positionAt(absolute), document.positionAt(absolute))
    });
  }

  return properties;
}

function matchingBraceOffset(text, openBrace) {
  let depth = 0;
  for (let i = openBrace; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function enclosingClassNameBeforeOffset(text, offset) {
  let result = "";
  const regex = /\b(class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (let match = regex.exec(text); match !== null && match.index < offset; match = regex.exec(text)) {
    result = match[2];
  }
  return result;
}

async function openLocation(location) {
  const range = location.range || new vscode.Range(0, 0, 0, 0);
  const position = range.start || new vscode.Position(0, 0);
  await vscode.window.showTextDocument(location.uri, {
    selection: new vscode.Range(position, position),
    preview: true
  });
}

function activePhpClassContext() {
  const editor = vscode.window.activeTextEditor;
  let structure, offset, classInfo;

  if (editor === undefined || editor.document.languageId !== "php") {
    return undefined;
  }

  structure = parsePhpStructure(editor.document);
  offset = editor.document.offsetAt(editor.selection.active);
  classInfo = structure.classes.find((candidate) => offset > candidate.openBrace && offset < candidate.closeBrace);
  if (!classInfo) {
    return undefined;
  }

  return { editor, classInfo };
}

function phpMemberNameSuffix(name) {
  return name.length > 0 ? name[0].toUpperCase() + name.slice(1) : name;
}

function phpPropertyParameter(property) {
  return (property.type !== "" ? property.type + " " : "") + "$" + property.name;
}

function classInsertPosition(document, classInfo) {
  return document.positionAt(classInfo.closeBrace);
}

function classIndent(document, classInfo) {
  const closeLine = document.lineAt(document.positionAt(classInfo.closeBrace).line).text;
  const match = closeLine.match(/^(\s*)/u);
  const base = match ? match[1] : "";

  return { base, inner: base + "    " };
}

function methodExists(classInfo, methodName) {
  return classInfo.methods.some((method) => method.name.toLowerCase() === methodName.toLowerCase());
}

async function insertGeneratedClassCode(editor, classInfo, code) {
  const edit = new vscode.WorkspaceEdit();
  const position = classInsertPosition(editor.document, classInfo);

  edit.insert(editor.document.uri, position, code);
  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(localize("codegen.generated"));
}

async function generateConstructorCommand() {
  const context = activePhpClassContext();
  let properties, indent, params, assignments, code;

  if (!context) {
    vscode.window.showInformationMessage(localize("codegen.noClass"));
    return;
  }
  if (methodExists(context.classInfo, "__construct")) {
    vscode.window.showInformationMessage(localize("codegen.constructorExists"));
    return;
  }

  properties = context.classInfo.properties.filter((property) => property.name !== "");
  if (properties.length === 0) {
    vscode.window.showInformationMessage(localize("codegen.noProperties"));
    return;
  }

  indent = classIndent(context.editor.document, context.classInfo);
  params = properties.map((property) => indent.inner + "    " + phpPropertyParameter(property)).join(",\n");
  assignments = properties.map((property) => indent.inner + "    $this->" + property.name + " = $" + property.name + ";").join("\n");
  code = "\n" + indent.inner + "public function __construct(\n" + params + "\n" + indent.inner + ") {\n" + assignments + "\n" + indent.inner + "}\n";
  await insertGeneratedClassCode(context.editor, context.classInfo, code);
}

async function generateGettersSettersCommand() {
  const context = activePhpClassContext();
  let properties, indent, chunks, suffix, type, getterName, setterName, getterReturn, setterParam;

  if (!context) {
    vscode.window.showInformationMessage(localize("codegen.noClass"));
    return;
  }

  properties = context.classInfo.properties.filter((property) => property.name !== "");
  if (properties.length === 0) {
    vscode.window.showInformationMessage(localize("codegen.noProperties"));
    return;
  }

  indent = classIndent(context.editor.document, context.classInfo);
  chunks = [];
  for (const property of properties) {
    suffix = phpMemberNameSuffix(property.name);
    type = property.type !== "" ? property.type : "mixed";
    getterName = "get" + suffix;
    setterName = "set" + suffix;
    if (!methodExists(context.classInfo, getterName)) {
      getterReturn = indent.inner + "public function " + getterName + "(): " + type + "\n" +
        indent.inner + "{\n" +
        indent.inner + "    return $this->" + property.name + ";\n" +
        indent.inner + "}\n";
      chunks.push(getterReturn);
    }
    if (!property.readonly && !methodExists(context.classInfo, setterName)) {
      setterParam = property.type !== "" ? property.type + " $" + property.name : "$" + property.name;
      chunks.push(indent.inner + "public function " + setterName + "(" + setterParam + "): self\n" +
        indent.inner + "{\n" +
        indent.inner + "    $this->" + property.name + " = $" + property.name + ";\n" +
        indent.inner + "    return $this;\n" +
        indent.inner + "}\n");
    }
  }

  if (chunks.length === 0) {
    vscode.window.showInformationMessage(localize("codegen.generated"));
    return;
  }

  await insertGeneratedClassCode(context.editor, context.classInfo, "\n" + chunks.join("\n"));
}

async function generateMethodStubCommand() {
  const context = activePhpClassContext();
  let name, indent, code;

  if (!context) {
    vscode.window.showInformationMessage(localize("codegen.noClass"));
    return;
  }

  name = await vscode.window.showInputBox({
    title: localize("codegen.methodName"),
    validateInput: (value) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? undefined : localize("codegen.invalidMethod")
  });
  if (typeof name !== "string" || name === "") {
    return;
  }

  indent = classIndent(context.editor.document, context.classInfo);
  code = "\n" + indent.inner + "public function " + name + "(): void\n" +
    indent.inner + "{\n" +
    indent.inner + "}\n";
  await insertGeneratedClassCode(context.editor, context.classInfo, code);
}

async function searchFrameworkArtifactsCommand() {
  const patterns = [
    "routes/**/*.php",
    "app/Http/Controllers/**/*.php",
    "app/Models/**/*.php",
    "resources/views/**/*.blade.php",
    "src/Controller/**/*.php",
    "src/Entity/**/*.php",
    "templates/**/*.twig",
    "config/routes/**/*",
    "config/services.*"
  ];
  const seen = new Set();
  const items = [];

  for (const pattern of patterns) {
    const uris = await vscode.workspace.findFiles(pattern, "{**/vendor/**,**/.git/**,**/.lsparrot/**}", 500);
    for (const uri of uris) {
      if (seen.has(uri.toString())) {
        continue;
      }
      seen.add(uri.toString());
      items.push({
        label: path.basename(uri.fsPath),
        description: path.dirname(uri.fsPath),
        detail: uri.fsPath,
        uri
      });
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage(localize("framework.noArtifacts"));
    return;
  }

  const selected = await vscode.window.showQuickPick(items.sort((left, right) => left.detail.localeCompare(right.detail)), {
    title: localize("framework.title"),
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (selected) {
    await vscode.window.showTextDocument(selected.uri, { preview: true });
  }
}

async function debugCurrentFileCommand() {
  const editor = vscode.window.activeTextEditor;
  const folder = editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri) : undefined;
  const cwd = folder ? folder.uri.fsPath : currentWorkspaceRoot || process.cwd();

  if (!editor || editor.document.languageId !== "php" || editor.document.uri.scheme !== "file") {
    vscode.window.showInformationMessage(localize("debug.noFile"));
    return;
  }

  await vscode.debug.startDebugging(folder, {
    type: "php",
    request: "launch",
    name: "LSParrot: Current PHP File",
    program: editor.document.uri.fsPath,
    cwd
  });
  vscode.window.showInformationMessage(localize("debug.started"));
}

function initializePhpTesting(context) {
  let runProfile, debugProfile;

  if (!vscode.tests || typeof vscode.tests.createTestController !== "function") {
    return;
  }

  phpTestController = vscode.tests.createTestController("lsparrotPhp", "LSParrot PHP");
  context.subscriptions.push(phpTestController);
  runProfile = phpTestController.createRunProfile("Run", vscode.TestRunProfileKind.Run, (request, token) => runPhpTestRequest(request, token, false), true);
  debugProfile = phpTestController.createRunProfile("Debug", vscode.TestRunProfileKind.Debug, (request, token) => runPhpTestRequest(request, token, true), false);
  context.subscriptions.push(runProfile);
  context.subscriptions.push(debugProfile);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
    if (isPhpFileDocument(document)) {
      upsertPhpTestDocument(document);
    }
  }));

  phpTestWatchers = [
    vscode.workspace.createFileSystemWatcher("**/*Test.php"),
    vscode.workspace.createFileSystemWatcher("**/tests/**/*.php"),
    vscode.workspace.createFileSystemWatcher("**/Tests/**/*.php")
  ];
  for (const watcher of phpTestWatchers) {
    context.subscriptions.push(watcher);
    watcher.onDidCreate(updatePhpTestUri, null, context.subscriptions);
    watcher.onDidChange(updatePhpTestUri, null, context.subscriptions);
    watcher.onDidDelete(deletePhpTestUri, null, context.subscriptions);
  }

  discoverPhpTestsInWorkspace();
}

async function discoverPhpTestsInWorkspace() {
  const patterns = ["**/*Test.php", "**/tests/**/*.php", "**/Tests/**/*.php"];
  const seen = new Set();
  let uris;

  if (!phpTestController) {
    return;
  }

  for (const pattern of patterns) {
    try {
      uris = await vscode.workspace.findFiles(pattern, "{**/vendor/**,**/.git/**,**/.lsparrot/**}", 1000);
    } catch (error) {
      log("test discovery failed: " + (error instanceof Error ? error.message : String(error)));
      continue;
    }
    for (const uri of uris) {
      if (seen.has(uri.toString())) {
        continue;
      }
      seen.add(uri.toString());
      await updatePhpTestUri(uri);
    }
  }
}

async function updatePhpTestUri(uri) {
  let document;

  if (!phpTestController || uri.scheme !== "file" || !isPhpCandidatePath(uri.fsPath)) {
    return;
  }

  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (_error) {
    return;
  }

  upsertPhpTestDocument(document);
}

function deletePhpTestUri(uri) {
  if (!phpTestController) {
    return;
  }

  phpTestItemData.delete(uri.toString());
  phpTestController.items.delete(uri.toString());
}

function upsertPhpTestDocument(document) {
  const tests = collectPhpTests(document);
  const id = document.uri.toString();
  let fileItem, children;

  if (!phpTestController) {
    return;
  }
  if (tests.length === 0) {
    phpTestItemData.delete(id);
    phpTestController.items.delete(id);
    return;
  }

  fileItem = phpTestController.items.get(id);
  if (!fileItem) {
    fileItem = phpTestController.createTestItem(id, path.basename(document.uri.fsPath), document.uri);
    phpTestController.items.add(fileItem);
  }

  fileItem.label = path.basename(document.uri.fsPath);
  fileItem.range = new vscode.Range(0, 0, 0, 0);
  phpTestItemData.set(id, { uri: document.uri, runner: tests.some((test) => test.runner === "pest") ? "pest" : "phpunit", filter: "" });
  children = tests.map((test) => {
    const child = phpTestController.createTestItem(id + "#" + test.id, test.label, document.uri);
    child.range = test.range;
    phpTestItemData.set(child.id, { uri: document.uri, runner: test.runner, filter: test.filter });
    return child;
  });
  fileItem.children.replace(children);
}

function collectPhpTests(document) {
  const text = document.getText();
  const tests = [];
  const methodRegex = /(?:#\[\s*(?:[A-Za-z_][A-Za-z0-9_\\]*\\)?Test\s*(?:\([^)]*\))?\s*\]\s*)?(?:\/\*\*[\s\S]*?@test[\s\S]*?\*\/\s*)?(?:public\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const pestRegex = /\b(it|test)\s*\(\s*(['"])(.*?)\2/g;
  let match, prefix, hasAttributeOrDoc;

  for (match = methodRegex.exec(text); match !== null; match = methodRegex.exec(text)) {
    prefix = match[0].slice(0, match[0].indexOf("function"));
    hasAttributeOrDoc = prefix.includes("#[") || prefix.includes("@test");
    if (!hasAttributeOrDoc && !match[1].startsWith("test")) {
      continue;
    }
    tests.push({
      id: "phpunit:" + match[1] + ":" + String(match.index),
      label: match[1],
      filter: match[1],
      runner: "phpunit",
      range: new vscode.Range(document.positionAt(match.index), document.positionAt(match.index))
    });
  }

  for (match = pestRegex.exec(text); match !== null; match = pestRegex.exec(text)) {
    tests.push({
      id: "pest:" + String(match.index),
      label: match[3],
      filter: match[3],
      runner: "pest",
      range: new vscode.Range(document.positionAt(match.index), document.positionAt(match.index))
    });
  }

  return tests;
}

async function runPhpTestRequest(request, token, debug) {
  const run = phpTestController.createTestRun(request);
  const items = requestedPhpTestItems(request);

  try {
    for (const item of items) {
      if (token.isCancellationRequested) {
        run.skipped(item);
        continue;
      }
      await runPhpTestItem(item, run, token, debug);
    }
  } finally {
    run.end();
  }
}

function requestedPhpTestItems(request) {
  const items = [];

  if (request.include && request.include.length > 0) {
    for (const item of request.include) {
      collectPhpTestRunItems(item, items);
    }
    return items;
  }

  phpTestController.items.forEach((item) => {
    items.push(item);
  });

  return items;
}

function collectPhpTestRunItems(item, items) {
  if (item.children.size > 0) {
    items.push(item);
    return;
  }

  items.push(item);
}

async function runPhpTestItem(item, run, token, debug) {
  const data = phpTestItemData.get(item.id);
  const execution = data ? phpTestExecution(data, item) : undefined;
  let result;

  if (!data || !execution) {
    run.skipped(item);
    return;
  }

  run.enqueued(item);
  run.started(item);
  if (debug) {
    result = await debugPhpTestExecution(execution);
    if (result) {
      run.passed(item);
    } else {
      run.errored(item, new vscode.TestMessage(localize("test.runnerMissing")));
    }
    return;
  }

  result = await spawnPhpTestExecution(execution, token);
  run.appendOutput(result.output.replace(/\n/gu, "\r\n"), undefined, item);
  if (result.code === 0) {
    run.passed(item);
  } else {
    run.failed(item, new vscode.TestMessage(result.output || "PHP test failed."));
  }
}

function phpTestExecution(data, item) {
  const uri = data.uri || item.uri;
  const root = workspaceRootForUri(uri);
  const runner = resolvePhpTestRunner(root, data.runner);
  const args = [];

  if (!uri || !runner) {
    return undefined;
  }

  args.push(...runner.args);
  args.push(uri.fsPath);
  if (data.filter !== "") {
    args.push("--filter", data.filter);
  }

  return {
    command: runner.command,
    args,
    cwd: root,
    uri,
    runnerPath: runner.runnerPath
  };
}

function resolvePhpTestRunner(root, preferred) {
  const phpPath = vscode.workspace.getConfiguration(CONFIG_SECTION).get("phpPath", "php") || "php";
  const pest = path.join(root, "vendor", "bin", process.platform === "win32" ? "pest.bat" : "pest");
  const phpunit = path.join(root, "vendor", "bin", process.platform === "win32" ? "phpunit.bat" : "phpunit");
  let runnerPath;

  if (preferred === "pest" && fs.existsSync(pest)) {
    runnerPath = pest;
  } else if (fs.existsSync(phpunit)) {
    runnerPath = phpunit;
  } else if (fs.existsSync(pest)) {
    runnerPath = pest;
  } else {
    return undefined;
  }

  return {
    command: typeof phpPath === "string" && phpPath !== "" ? phpPath : "php",
    args: [runnerPath],
    runnerPath
  };
}

function workspaceRootForUri(uri) {
  const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;

  if (folder) {
    return folder.uri.fsPath;
  }

  return currentWorkspaceRoot !== "" ? currentWorkspaceRoot : process.cwd();
}

function spawnPhpTestExecution(execution, token) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(execution.command, execution.args, {
      cwd: execution.cwd,
      windowsHide: true
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: 1, output: error instanceof Error ? error.message : String(error) });
    });
    child.on("close", (code) => {
      resolve({ code: code === null ? 1 : code, output });
    });
    token.onCancellationRequested(() => {
      child.kill();
    });
  });
}

async function debugPhpTestExecution(execution) {
  const folder = vscode.workspace.getWorkspaceFolder(execution.uri);

  return vscode.debug.startDebugging(folder, {
    type: "php",
    request: "launch",
    name: "LSParrot: PHP Test",
    program: execution.runnerPath,
    args: execution.args.slice(1),
    cwd: execution.cwd
  });
}

function positionAtTextOffset(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  const lastNewline = before.lastIndexOf("\n");
  const character = lastNewline < 0 ? before.length : before.length - lastNewline - 1;
  return new vscode.Position(line, character);
}

function createGitBlameInlayProvider() {
  return {
    onDidChangeInlayHints: gitBlameEmitter ? gitBlameEmitter.event : undefined,
    async provideInlayHints(document, range, token) {
      if (!gitBlameEnabled || document.uri.scheme !== "file" || document.languageId !== "php") {
        return [];
      }

      const repo = await gitRootForPath(document.uri.fsPath);
      if (repo === "") {
        return [];
      }

      const blame = await gitBlameForDocument(document, repo);
      if (token.isCancellationRequested || blame.length === 0) {
        return [];
      }

      const hints = [];
      const start = Math.max(0, range.start.line);
      const end = Math.min(document.lineCount - 1, range.end.line);
      for (let line = start; line <= end; line++) {
        const entry = blame[line];
        if (!entry || !entry.author || !entry.commit || entry.commit.match(/^0+$/)) {
          continue;
        }

        const part = new vscode.InlayHintLabelPart(entry.author + " ");
        part.tooltip = entry.summary || entry.commit;
        part.command = {
          title: "Show Commit",
          command: "lsparrot.showGitBlameCommit",
          arguments: [{ repo, commit: entry.commit }]
        };
        const hint = new vscode.InlayHint(new vscode.Position(line, 0), [part], vscode.InlayHintKind.Parameter);
        hint.paddingRight = true;
        hints.push(hint);
      }

      return hints;
    }
  };
}

async function toggleGitBlame() {
  gitBlameEnabled = !gitBlameEnabled;
  gitBlameCache.clear();
  if (gitBlameEmitter) {
    gitBlameEmitter.fire();
  }
  vscode.window.showInformationMessage(localize(gitBlameEnabled ? "gitBlame.enabled" : "gitBlame.disabled"));
}

async function showGitBlameCommit(target) {
  let repo = target && target.repo;
  let commit = target && target.commit;
  if (!repo || !commit) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage(localize("gitBlame.noCommit"));
      return;
    }
    repo = await gitRootForPath(editor.document.uri.fsPath);
    const blame = await gitBlameForDocument(editor.document, repo);
    const entry = blame[editor.selection.active.line];
    commit = entry && entry.commit;
  }
  if (!repo || !commit) {
    vscode.window.showInformationMessage(localize("gitBlame.noCommit"));
    return;
  }

  try {
    const { stdout } = await execFile("git", ["-C", repo, "show", "--stat", "--decorate", "--no-ext-diff", "--color=never", commit], { maxBuffer: 1024 * 1024 * 8 });
    outputChannel.clear();
    outputChannel.appendLine(stdout);
    outputChannel.show(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(localize("gitBlame.showFailed", { message }));
  }
}

async function gitRootForPath(filePath) {
  const directory = path.dirname(filePath);
  if (gitRootCache.has(directory)) {
    return gitRootCache.get(directory);
  }

  try {
    const { stdout } = await execFile("git", ["-C", directory, "rev-parse", "--show-toplevel"], { maxBuffer: 1024 * 1024 });
    const root = stdout.trim();
    gitRootCache.set(directory, root);
    return root;
  } catch (_error) {
    gitRootCache.set(directory, "");
    return "";
  }
}

async function gitBlameForDocument(document, repo) {
  if (repo === "" || document.isUntitled) {
    return [];
  }

  const key = document.uri.fsPath + ":" + document.version;
  if (gitBlameCache.has(key)) {
    return gitBlameCache.get(key);
  }

  const relative = path.relative(repo, document.uri.fsPath);
  try {
    const { stdout } = await execFile("git", ["-C", repo, "blame", "--line-porcelain", "--", relative], { maxBuffer: 1024 * 1024 * 16 });
    const blame = parseGitBlame(stdout);
    gitBlameCache.set(key, blame);
    return blame;
  } catch (_error) {
    gitBlameCache.set(key, []);
    return [];
  }
}

function parseGitBlame(output) {
  const entries = [];
  let current = {};
  for (const line of output.split(/\r?\n/)) {
    const header = line.match(/^([0-9a-f]{40})\s/);
    if (header) {
      current = { commit: header[1], author: "", summary: "" };
      continue;
    }
    if (line.startsWith("author ")) {
      current.author = line.slice("author ".length);
      continue;
    }
    if (line.startsWith("summary ")) {
      current.summary = line.slice("summary ".length);
      continue;
    }
    if (line.startsWith("\t")) {
      entries.push(current);
    }
  }
  return entries;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function symbolKindIcon(kind) {
  switch (kind) {
    case vscode.SymbolKind.Class:
      return "$(symbol-class)";
    case vscode.SymbolKind.Interface:
      return "$(symbol-interface)";
    case vscode.SymbolKind.Enum:
      return "$(symbol-enum)";
    case vscode.SymbolKind.Function:
      return "$(symbol-function)";
    case vscode.SymbolKind.Method:
      return "$(symbol-method)";
    case vscode.SymbolKind.Namespace:
      return "$(symbol-namespace)";
    case vscode.SymbolKind.Variable:
      return "$(symbol-variable)";
    default:
      return "$(symbol-misc)";
  }
}

function symbolKindName(kind) {
  switch (kind) {
    case vscode.SymbolKind.Class:
      return "class";
    case vscode.SymbolKind.Interface:
      return "interface";
    case vscode.SymbolKind.Enum:
      return "enum";
    case vscode.SymbolKind.Function:
      return "function";
    case vscode.SymbolKind.Method:
      return "method";
    case vscode.SymbolKind.Namespace:
      return "namespace";
    case vscode.SymbolKind.Variable:
      return "variable";
    default:
      return "symbol";
  }
}

function analyzerModeIsSelected(currentSetting, value, available) {
  const normalized = normalizeAnalyzer(currentSetting);

  if (normalized === "auto") {
    return available;
  }
  if (Array.isArray(normalized)) {
    return normalized.includes(value);
  }

  return normalized === value;
}

function selectedAnalyzerValue(items) {
  const analyzers = [];

  for (const item of items) {
    if ((item.value === "phpstan" || item.value === "psalm" || item.value === "psalm-ls") && !analyzers.includes(item.value)) {
      analyzers.push(item.value);
    }
  }

  return analyzers;
}

function analyzerOptionValue(value) {
  const normalized = normalizeAnalyzer(value);

  if (Array.isArray(normalized)) {
    return normalized.length > 0 ? normalized : "lsparrot";
  }

  return normalized;
}

function sameAnalyzerSelection(currentSetting, value, projectRoot) {
  return analyzerSelectionKey(currentSetting, projectRoot) === analyzerSelectionKey(value, projectRoot);
}

function analyzerSelectionKey(value, projectRoot) {
  const normalized = normalizeAnalyzer(value);

  if (normalized === "auto") {
    return availableAnalyzerBackends(projectRoot).join("+");
  }
  if (Array.isArray(normalized)) {
    return [...normalized].sort().join("+");
  }
  if (normalized === "phpstan" || normalized === "psalm" || normalized === "psalm-ls") {
    return normalized;
  }

  return "";
}

function availableAnalyzerBackends(projectRoot) {
	const analyzers = [];

	if (projectAnalyzerUsable(projectRoot, "phpstan")) {
		analyzers.push("phpstan");
	}
	if (projectAnalyzerUsable(projectRoot, "psalm")) {
		analyzers.push("psalm");
	}
	if (projectAnalyzerUsable(projectRoot, "psalm-ls")) {
		analyzers.push("psalm-ls");
	}

	return analyzers;
}

function formatAnalyzerSelectionName(value) {
  return formatAnalyzerName(value);
}

function buildRuntimePhpArgs(config, extensionPath) {
  const args = [];
  const generated = [];
  const configuredPhpArgs = config.get("phpArgs", []);
  const phpArgs = Array.isArray(configuredPhpArgs) ? configuredPhpArgs : [];
  const memoryLimit = config.get("phpMemoryLimit", "-1");
  const enableJit = config.get("enableJit", true);
  const jitBufferSize = config.get("jitBufferSize", "32M");
  const jitMode = config.get("jitMode", "tracing");

  if (extensionPath !== "") {
    args.push("-dextension=" + extensionPath);
  }

  if (typeof memoryLimit === "string" && memoryLimit !== "") {
    generated.push("-dmemory_limit=" + memoryLimit);
  }

  if (enableJit === true) {
    generated.push("-dopcache.enable_cli=1");
    if (typeof jitBufferSize === "string" && jitBufferSize !== "") {
      generated.push("-dopcache.jit_buffer_size=" + jitBufferSize);
    }
    if (typeof jitMode === "string" && jitMode !== "") {
      generated.push("-dopcache.jit=" + jitMode);
    }
  }

  args.push(...generated);
  for (const arg of phpArgs) {
    if (typeof arg === "string" && arg !== "") {
      args.push(arg);
    }
  }

  return args;
}

async function verifyPhpRuntime(phpPath, runtimePhpArgs, cwd) {
  if (!await probePhpRuntime(phpPath, runtimePhpArgs, cwd)) {
    throw new Error(localize("startup.extensionMissing", { phpPath }));
  }
}

async function probePhpRuntime(phpPath, runtimePhpArgs, cwd) {
  const probeArgs = [
    ...runtimePhpArgs,
    "-ddisplay_errors=stderr",
    "-r",
    "fwrite(STDOUT, (extension_loaded('lsparrot') && function_exists('LSParrot\\\\start_lsp')) ? '1' : '0');"
  ];
  let result;

  try {
    result = await execFile(phpPath, probeArgs, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";

    if (isMissingPhpBinaryError(error)) {
      throw new Error(localize("startup.phpNotFound", { phpPath }));
    }
    if (stdout !== "1" && (stdout === "0" || phpProbeStderrSuggestsMissingExtension(error))) {
      return false;
    }
    if (isPhpExecutionError(error)) {
      throw new Error(localize("startup.phpNotExecutable", { phpPath, message: processErrorSummary(error) }));
    }

    throw new Error(localize("startup.probeFailed", { phpPath, message: processErrorSummary(error) }));
  }

  return String(result.stdout).trim() === "1";
}

async function handleStartupPreflightFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const localizedMessage = localize("status.startFailed", { name: EXTENSION_NAME, message });
  const openSettings = localize("action.openSettings");
  let selected;

  log("Failed to start server: " + message);
  client = undefined;
  activeAnalyzerStatuses.clear();
  clearCrashRestartTimer();
  clearServerStartStableResetTimer();
  clearStatusPolling();
  setStatus("stopped", localizedMessage);
  await updateLsparrotEnabled(false).then(undefined, (updateError) => {
    log("failed to disable LSParrot after startup failure: " + (updateError instanceof Error ? updateError.message : String(updateError)));
  });
  selected = await vscode.window.showErrorMessage(message, openSettings);
  if (selected === openSettings) {
    await openLsparrotSettings();
  }
}

async function handleUnexpectedStartFailure(error) {
  serverStartInProgress = false;
  await handleStartupPreflightFailure(error);
}

function isMissingPhpBinaryError(error) {
  return error !== null && typeof error === "object" && error.code === "ENOENT";
}

function isPhpExecutionError(error) {
  return error !== null
    && typeof error === "object"
    && (error.code === "EACCES" || error.code === "EPERM");
}

function phpProbeStderrSuggestsMissingExtension(error) {
  const stderr = error !== null && typeof error === "object" && typeof error.stderr === "string" ? error.stderr.toLowerCase() : "";

  return stderr.includes("lsparrot") || stderr.includes("php_lsparrot");
}

function processErrorSummary(error) {
  const parts = [];
  const message = error instanceof Error ? error.message : "";
  const stderr = error !== null && typeof error === "object" && typeof error.stderr === "string" ? firstNonEmptyLine(error.stderr) : "";

  if (message !== "") {
    parts.push(message);
  }
  if (stderr !== "" && !message.includes(stderr)) {
    parts.push(stderr);
  }

  return parts.length > 0 ? parts.join(" ") : "unknown error";
}

function firstNonEmptyLine(value) {
  for (const line of value.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (trimmed !== "") {
      return trimmed;
    }
  }

  return "";
}

function numericConfig(config, key, fallback) {
  const value = Number(config.get(key, fallback));
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

function nonNegativeIntegerConfig(config, key, fallback) {
  return nonNegativeIntegerValue(config.get(key, fallback), fallback);
}

function nonNegativeIntegerValue(rawValue, fallback) {
  const value = Math.floor(Number(rawValue));
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

function optionalPositiveIntegerConfig(config, key) {
  const value = Number(config.get(key, 0));
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function resolveWorkspaceRoot(context) {
  const folders = vscode.workspace.workspaceFolders;
  if (folders !== undefined && folders.length > 0) {
    return folders[0].uri.fsPath;
  }

  return context.extensionPath;
}

async function resolveEffectiveExtensionPath(config, phpPath, cwd) {
  const extensionPath = resolveExtensionPath(config);
  const runtimePhpArgsWithoutExtensionPath = buildRuntimePhpArgs(config, "");

  if (extensionPath === "") {
    return "";
  }
  if (await probePhpRuntime(phpPath, runtimePhpArgsWithoutExtensionPath, cwd)) {
    log("Ignoring resolved ext-lsparrot extension path because PHP already loads ext-lsparrot.");
    return "";
  }

  return extensionPath;
}

function resolveExtensionPath(config) {
  const configured = config.get("extensionPath", "");
  if (typeof configured === "string" && configured !== "") {
    return configured;
  }

  if (!config.get("autoDetectWorkspaceExtension", true)) {
    return "";
  }

  const folders = vscode.workspace.workspaceFolders || [];
  for (const folder of folders) {
    const detected = detectBuiltExtension(folder.uri.fsPath);
    if (detected !== "") {
      return detected;
    }
  }

  return "";
}

function detectBuiltExtension(root) {
  const candidates = [
    path.join(root, "ext", "modules", "lsparrot.so"),
    path.join(root, "ext", "modules", "lsparrot.dylib"),
    path.join(root, "ext", "modules", "php_lsparrot.dll"),
    path.join(root, "ext", "modules", "lsparrot.dll")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

function log(message) {
  if (outputChannel !== undefined) {
    outputChannel.appendLine("[client] " + message);
  }
}

function localize(key, values) {
  const locale = (vscode.env.language || "en").toLowerCase();
  const table = locale === "ja" || locale.startsWith("ja-") ? RUNTIME_MESSAGES.ja : RUNTIME_MESSAGES.en;
  const template = table[key] || RUNTIME_MESSAGES.en[key] || key;

  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => {
    if (values !== undefined && Object.prototype.hasOwnProperty.call(values, name)) {
      return String(values[name]);
    }

    return match;
  });
}

function handleAnalyzerStatus(params) {
  const state = typeof params.state === "string" ? params.state : "idle";
  const analyzer = typeof params.analyzer === "string" && params.analyzer !== "" ? params.analyzer : "analyzer";
  const message = typeof params.message === "string" ? params.message : "";
  const driverLabel = typeof params.label === "string" && params.label !== "" ? params.label : "";
  const projectRoot = typeof params.projectRoot === "string" && params.projectRoot !== "" ? params.projectRoot : "";
  const logMessage = analyzerLogMessage(message, projectRoot);

  applyAnalyzerProjectStatus(analyzer, state, projectRoot);

  if (typeof params.driver === "string" && params.driver !== "") {
    currentDriverLabel = driverLabel !== "" ? driverLabel : formatAnalyzerName(params.driver);
    setStatus(activeAnalyzerStatuses.size > 0 ? "analyzing" : "ready", message || localize("status.running", { name: EXTENSION_NAME }));
    if (message !== "") {
      log("analyzer: " + logMessage);
    }
    return;
  }

  if (state === "error") {
    activeAnalyzerStatuses.delete(analyzer);
    if (typeof params.missingAnalyzer === "string" && params.missingAnalyzer !== "") {
      registerAnalyzerInstallWatcher(params.missingAnalyzer);
    }
    setStatus(activeAnalyzerStatuses.size > 0 ? "analyzing" : "ready", message || localize("status.running", { name: EXTENSION_NAME }));
    if (message !== "") {
      log("analyzer error: " + logMessage);
    }
    return;
  }

  if (state === "running") {
    activeAnalyzerStatuses.add(analyzer);
    setStatus("analyzing", message || localize("status.analyzingProject"));
  } else {
    if (params.analyzer === undefined) {
      activeAnalyzerStatuses.clear();
    } else {
      activeAnalyzerStatuses.delete(analyzer);
    }

    if (activeAnalyzerStatuses.size > 0) {
      setStatus("analyzing", message || localize("status.analyzingProject"));
    } else {
      setStatus("ready", message || localize("status.running", { name: EXTENSION_NAME }));
    }
  }

  if (analyzer === "index" && state !== "running") {
    resetClassDescendantCache();
  }

  if (message !== "") {
    log("analyzer: " + logMessage);
  }
}

function analyzerLogMessage(message, projectRoot) {
  if (projectRoot === "") {
    return message;
  }

  return message + " (" + projectRoot + ")";
}

function applyAnalyzerProjectStatus(analyzer, state, projectRoot) {
  let analyzers;
  let entry;

  if ((analyzer !== "phpstan" && analyzer !== "psalm" && analyzer !== "psalm-ls") || projectRoot === "") {
    return;
  }
  if (currentServerStatus === undefined || currentServerStatus === null || typeof currentServerStatus !== "object") {
    currentServerStatus = {};
  }
  if (currentServerStatus.analyzers === undefined || currentServerStatus.analyzers === null || typeof currentServerStatus.analyzers !== "object") {
    currentServerStatus.analyzers = {};
  }

  analyzers = currentServerStatus.analyzers;
  if (analyzers[analyzer] === undefined || analyzers[analyzer] === null || typeof analyzers[analyzer] !== "object") {
    analyzers[analyzer] = { enabled: true, running: false, projects: {} };
  }

  entry = analyzers[analyzer];
  entry.enabled = true;
  if (state === "running") {
    entry.running = true;
    setAnalyzerProjectStatus(entry, projectRoot, "running");
  } else if (state === "idle") {
    entry.running = false;
    setAnalyzerProjectStatus(entry, projectRoot, "ready");
  } else if (state === "error") {
    entry.running = false;
    setAnalyzerProjectStatus(entry, projectRoot, "error");
  }
}

function setAnalyzerProjectStatus(entry, projectRoot, state) {
  if (entry.projects === undefined || entry.projects === null || typeof entry.projects !== "object" || Array.isArray(entry.projects)) {
    entry.projects = {};
  }

  entry.projects[projectRoot] = state;
}

function handleAnalyzerCompletionReady(params) {
  const editor = vscode.window.activeTextEditor;
  const uri = params && typeof params.uri === "string" ? params.uri : "";
  const analyzer = params && typeof params.analyzer === "string" ? params.analyzer : "";

  if (editor === undefined || editor.document.languageId !== "php" || editor.document.uri.scheme !== "file") {
    return;
  }
  if (uri !== "" && editor.document.uri.toString() !== uri) {
    return;
  }

  if (analyzer !== "") {
    log("completion cache ready: " + formatAnalyzerName(analyzer));
  }
  vscode.commands.executeCommand("editor.action.triggerSuggest").then(undefined, (error) => {
    log("completion refresh failed: " + (error instanceof Error ? error.message : String(error)));
  });
}

function createStatusMetricItem(name, priority) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);

  item.name = name;
  return item;
}

function setStatus(state, tooltip) {
  if (statusBarItem === undefined) {
    return;
  }

  currentStatusState = state;
  currentStatusTooltip = tooltip;
  const projectInfo = activeProjectInfo();
  const enabled = isLsparrotEnabled();
  const driverText = state === "stopped" || state === "starting" ? currentDriverLabel : statusDriverText(projectInfo);
  const addonText = state === "stopped" ? "" : statusAddonText(projectInfo);

  if (enabled && state !== "stopped") {
    logActiveProjectIfChanged(projectInfo);
  }

  statusBarItem.text = (enabled ? ENABLED_STATUS_ICON : DISABLED_STATUS_ICON) + " " + EXTENSION_NAME;
  statusBarItem.tooltip = [tooltip, localize(enabled ? "tooltip.toggleDisable" : "tooltip.toggleEnable")].join("\n");
  statusBarItem.show();
  updateSettingsStatusItem();
  updateEngineStatusItem(state, tooltip, projectInfo, driverText, addonText, enabled);
  updateStatusSegmentItems(state, tooltip, projectInfo);
}

function updateSettingsStatusItem() {
  if (statusSettingsItem === undefined) {
    return;
  }

  statusSettingsItem.text = "$(gear)";
  statusSettingsItem.tooltip = localize("tooltip.openSettings");
  statusSettingsItem.show();
}

function updateEngineStatusItem(state, tooltip, projectInfo, driverText, addonText, enabled) {
  if (statusEngineItem === undefined) {
    return;
  }
  if (!enabled) {
    statusEngineItem.hide();
    return;
  }

  if (state === "analyzing") {
    statusEngineItem.text = driverText + addonText + " $(sync~spin)";
  } else if (state === "starting") {
    statusEngineItem.text = localize("status.modeStarting") + " $(sync~spin)";
  } else {
    statusEngineItem.text = driverText + addonText;
  }

  const tooltipLines = [tooltip];
  if ((state === "ready" || state === "analyzing" || state === "starting") && projectInfo.root !== "") {
    tooltipLines.push(localize("tooltip.project", { name: projectInfo.name, path: projectInfo.root }));
  }
  if (state === "ready" || state === "analyzing") {
    tooltipLines.push(localize("tooltip.driver", { driver: driverText }));
    const readiness = activeExternalAnalyzerReadiness();
    if (readiness.hasExternal) {
      tooltipLines.push(localize(readiness.problem ? "tooltip.analyzersUnavailable" : (readiness.ready ? "tooltip.analyzersReady" : "tooltip.analyzersPending")));
    }
  }
  tooltipLines.push(localize("tooltip.switchAnalyzer"));
  statusEngineItem.tooltip = tooltipLines.join("\n");
  statusEngineItem.show();
}

function activeProjectInfo() {
  const root = resolveActiveComposerProjectRoot();
  const basename = root !== "" ? path.basename(root) : "";
  const name = basename !== "" ? basename : root;

  return { root, name };
}

async function revealActiveProjectRootInExplorer() {
  const projectInfo = activeProjectInfo();

  if (projectInfo.root === "" || !fs.existsSync(projectInfo.root)) {
    vscode.window.showWarningMessage(localize("project.noRoot"));
    return;
  }

  await vscode.commands.executeCommand("workbench.view.explorer");
  await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(projectInfo.root));
}

function restartWhenActiveProjectConfigurationChanged() {
  const editor = vscode.window.activeTextEditor;
  const projectRoot = resolveActiveComposerProjectRoot();
  const setting = configuredAnalyzerSettingForProject(projectRoot);
  const currentKey = analyzerSelectionKey(currentAnalyzerSetting, currentAnalyzerProjectRoot);
  const nextKey = analyzerSelectionKey(setting, projectRoot);

  if (editor === undefined || !isPhpFileDocument(editor.document)) {
    return;
  }
  if (client === undefined || projectRoot === "") {
    return;
  }
  if (projectRoot === currentAnalyzerProjectRoot && nextKey === currentKey) {
    return;
  }

  log("Active Composer project changed; restarting server.");
  restart();
}

function scheduleRestartWhenActiveProjectConfigurationChanged() {
  const editor = vscode.window.activeTextEditor;

  if (editor === undefined || !isPhpFileDocument(editor.document)) {
    return;
  }
  if (activeProjectRestartTimer !== undefined) {
    clearTimeout(activeProjectRestartTimer);
  }

  activeProjectRestartTimer = setTimeout(() => {
    activeProjectRestartTimer = undefined;
    restartWhenActiveProjectConfigurationChanged();
  }, 150);
}

function clearActiveProjectRestartTimer() {
  if (activeProjectRestartTimer !== undefined) {
    clearTimeout(activeProjectRestartTimer);
    activeProjectRestartTimer = undefined;
  }
}

function statusProjectText(projectInfo) {
  if (projectInfo.root === "" || projectInfo.name === "") {
    return "";
  }

  return "PJ: " + projectInfo.name;
}

function logActiveProjectIfChanged(projectInfo) {
  if (projectInfo.root === "" || projectInfo.root === lastLoggedProjectRoot) {
    return;
  }

  lastLoggedProjectRoot = projectInfo.root;
  log(localize("log.targetProject", { path: projectInfo.root }));
  notifyIgnoredPhpstanLevelIfNeeded(projectInfo.root);
  notifyIgnoredPsalmLevelIfNeeded(projectInfo.root);
}

function statusDriverText(projectInfo) {
  const projectRoot = projectInfo !== undefined ? projectInfo.root : resolveActiveComposerProjectRoot();
  const analyzers = enabledExternalAnalyzersForProject(projectRoot).filter((analyzer) => analyzer !== "psalm-ls");
  const unavailableAnalyzers = configuredExternalAnalyzersForProject(projectRoot).filter((analyzer) => {
    return analyzer !== "psalm-ls" && !projectAnalyzerUsable(projectRoot, analyzer);
  });
  const labels = ["LSParrot Engine"];

  if (analyzers.length === 0) {
    if (unavailableAnalyzers.length > 0) {
      return labels.concat(unavailableAnalyzers.map((analyzer) => formatAnalyzerName(analyzer) + " $(warning)")).join(" + ");
    }

    return "LSParrot Engine";
  }

  return labels.concat(analyzers.map((analyzer) => {
    return formatAnalyzerName(analyzer) + externalAnalyzerStatusMark(analyzer, projectRoot);
  })).join(" + ");
}

function statusAddonText(projectInfo) {
  const projectRoot = projectInfo !== undefined ? projectInfo.root : resolveActiveComposerProjectRoot();

  if (!psalmLsConfiguredForProject(projectRoot)) {
    return "";
  }

  return " [+ Psalm LS" + psalmLsStatusMark(projectRoot) + "]";
}

function psalmLsStatusMark(projectRoot) {
  if (externalAnalyzerHasError("psalm-ls", projectRoot) || !projectAnalyzerUsable(projectRoot, "psalm-ls")) {
    return " $(warning)";
  }
  if (externalAnalyzerIsReady("psalm-ls", projectRoot)) {
    return " $(check)";
  }

  return " $(sync~spin)";
}

function psalmLsConfiguredForProject(projectRoot) {
  const setting = configuredAnalyzerSettingForProject(projectRoot);

  if (setting === "auto") {
    return projectAnalyzerExists(projectRoot, "psalm-ls");
  }
  if (Array.isArray(setting)) {
    return setting.includes("psalm-ls");
  }

  return setting === "psalm-ls";
}

function activeExternalAnalyzerReadiness() {
  const projectRoot = resolveActiveComposerProjectRoot();
  const analyzers = enabledExternalAnalyzersForProject(projectRoot);
  const unavailableAnalyzers = configuredExternalAnalyzersForProject(projectRoot).filter((analyzer) => {
    return !projectAnalyzerUsable(projectRoot, analyzer);
  });
  const erroredAnalyzers = configuredExternalAnalyzersForProject(projectRoot).filter((analyzer) => {
    return externalAnalyzerHasError(analyzer, projectRoot);
  });
  const hasProblem = unavailableAnalyzers.length > 0 || erroredAnalyzers.length > 0;

  if (analyzers.length === 0) {
    return { hasExternal: hasProblem, ready: false, problem: hasProblem };
  }

  for (const analyzer of analyzers) {
    if (!externalAnalyzerIsReady(analyzer, projectRoot)) {
      return { hasExternal: true, ready: false, problem: hasProblem };
    }
  }

  return { hasExternal: true, ready: !hasProblem, problem: hasProblem };
}

function externalAnalyzerIsReady(analyzer, projectRoot) {
  const entry = serverAnalyzerEntry(analyzer);

  return entry !== undefined && entry.enabled === true && analyzerProjectState(entry, projectRoot) === "ready";
}

function externalAnalyzerStatusMark(analyzer, projectRoot) {
  if (externalAnalyzerHasError(analyzer, projectRoot) || !projectAnalyzerUsable(projectRoot, analyzer)) {
    return " $(warning)";
  }
  if (externalAnalyzerIsReady(analyzer, projectRoot)) {
    return " $(check)";
  }
  if (externalAnalyzerIsProcessing(analyzer, projectRoot)) {
    return " $(sync~spin)";
  }

  return "";
}

function externalAnalyzerHasError(analyzer, projectRoot) {
  const entry = serverAnalyzerEntry(analyzer);
  const projectState = entry !== undefined ? analyzerProjectState(entry, projectRoot) : "";

  return projectState === "error";
}

function externalAnalyzerIsProcessing(analyzer, projectRoot) {
  const entry = serverAnalyzerEntry(analyzer);
  const projectState = entry !== undefined ? analyzerProjectState(entry, projectRoot) : "";

  return activeAnalyzerStatuses.has(analyzer)
    || (entry !== undefined && entry.running === true)
    || projectState === "running"
    || projectState === "pending";
}

function enabledExternalAnalyzersForProject(projectRoot) {
  return configuredExternalAnalyzersForProject(projectRoot).filter((analyzer) => {
    return projectAnalyzerUsable(projectRoot, analyzer);
  });
}

function configuredAnalyzerSettingForProject(projectRoot) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const projectConfig = readProjectVscodeConfig(projectRoot);

  return normalizeAnalyzer(projectAdditionalAnalyzerValue(projectConfig, config.get("additionalAnalyzer", [])));
}

function configuredExternalAnalyzersForProject(projectRoot) {
  const setting = configuredAnalyzerSettingForProject(projectRoot);

  if (setting === "auto") {
    return ["phpstan", "psalm", "psalm-ls"].filter((analyzer) => projectAnalyzerExists(projectRoot, analyzer));
  }
  if (Array.isArray(setting)) {
    return setting.filter((analyzer) => projectAnalyzerExists(projectRoot, analyzer));
  }
  if ((setting === "phpstan" || setting === "psalm" || setting === "psalm-ls") && projectAnalyzerExists(projectRoot, setting)) {
    return [setting];
  }

  return [];
}

function serverAnalyzerEntry(analyzer) {
  const analyzers = currentServerStatus && typeof currentServerStatus === "object" ? currentServerStatus.analyzers : undefined;
  const entry = analyzers && typeof analyzers === "object" ? analyzers[analyzer] : undefined;

  return entry && typeof entry === "object" ? entry : undefined;
}

function analyzerProjectState(entry, projectRoot) {
  const projects = entry.projects && typeof entry.projects === "object" ? entry.projects : undefined;
  const normalizedRoot = path.normalize(projectRoot);

  if (projects === undefined) {
    return "";
  }
  if (typeof projects[projectRoot] === "string") {
    return projects[projectRoot];
  }

  for (const [candidate, state] of Object.entries(projects)) {
    if (path.normalize(candidate) === normalizedRoot && typeof state === "string") {
      return state;
    }
  }

  return "";
}

function updateStatusSegmentItems(state, tooltip, projectInfo) {
  if (statusProjectItem === undefined || statusMemoryItem === undefined || statusProcessItem === undefined || statusProcessMemoryItem === undefined) {
    return;
  }
  if (state === "stopped") {
    statusProjectItem.hide();
    statusMemoryItem.hide();
    statusProcessItem.hide();
    statusProcessMemoryItem.hide();
    return;
  }

  if (projectInfo.root !== "" && projectInfo.name !== "") {
    statusProjectItem.text = statusProjectText(projectInfo);
    statusProjectItem.tooltip = [
      localize("tooltip.project", { name: projectInfo.name, path: projectInfo.root }),
      localize("tooltip.revealProject")
    ].join("\n");
    statusProjectItem.show();
  } else {
    statusProjectItem.hide();
  }
  statusMemoryItem.text = statusSymbolIndexMemoryText();
  statusProcessItem.text = "PROC: " + String(currentProcessMetrics.count);
  statusProcessMemoryItem.text = "PROCMEM: " + formatProcessMemoryValue(currentProcessMetrics.rssBytes);
  statusMemoryItem.tooltip = tooltip;
  statusProcessItem.tooltip = "LSParrot related PHP process count";
  statusProcessMemoryItem.tooltip = "Total RSS of LSParrot related PHP processes";
  statusMemoryItem.show();
  statusProcessItem.show();
  statusProcessMemoryItem.show();
}

function statusSymbolIndexMemoryText() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const symbolIndexUsed = parseStatusNumber(currentServerStatus, ["symbolIndex", "used"]);
  const symbolIndexMax = numberOr(
    parseStatusNumber(currentServerStatus, ["symbolIndex", "max"]),
    parseSizeToBytes(config.get("symbolIndexSize", "64M"))
  );

  return "MEM " + formatCompactMegabyteValue(symbolIndexUsed) + " / " + formatCompactMegabyteValue(symbolIndexMax);
}

function formatCompactMegabyteValue(value) {
  if (value === undefined || !Number.isFinite(value)) {
    return localize("metric.unknown");
  }

  return formatByteValue(value, 1024 * 1024, "MB", false);
}

function formatProcessMemoryValue(value) {
  if (value === undefined || !Number.isFinite(value)) {
    return localize("metric.unknown");
  }
  if (value >= 1024 * 1024 * 1024) {
    return formatByteValue(value, 1024 * 1024 * 1024, "GiB", true);
  }

  return formatByteValue(value, 1024 * 1024, "MiB", true);
}

function formatByteValue(value, divisor, suffix, separatedSuffix) {
  const amount = value / divisor;
  const digits = amount > 0 && amount < 10 && Math.abs(amount - Math.round(amount)) > 0.05 ? 1 : 0;
  const formatted = amount.toFixed(digits);

  return separatedSuffix ? formatted + " " + suffix : formatted + suffix;
}

async function collectRelatedProcessMetrics() {
  const roots = Array.from(activeServerProcesses)
    .map((child) => Number(child.pid))
    .filter((pid) => Number.isFinite(pid) && pid > 0);

  if (roots.length === 0) {
    return { count: 0, rssBytes: 0 };
  }
  if (process.platform === "win32") {
    return relatedProcessMetricsFromRows(await collectWindowsProcessRows(), roots);
  }

  return relatedProcessMetricsFromRows(await collectUnixProcessRows(), roots);
}

async function collectUnixProcessRows() {
  const result = await execFile("ps", ["-axo", "pid=,ppid=,rss=,command="], { maxBuffer: 16 * 1024 * 1024 });
  const rows = [];

  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u);
    if (match === null) {
      continue;
    }
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      command: match[4] || ""
    });
  }

  return rows;
}

async function collectWindowsProcessRows() {
  const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress";
  const result = await execFile("powershell.exe", ["-NoProfile", "-Command", script], { maxBuffer: 16 * 1024 * 1024 });
  const decoded = result.stdout.trim() !== "" ? JSON.parse(result.stdout) : [];
  const entries = Array.isArray(decoded) ? decoded : [decoded];

  return entries.map((entry) => {
    return {
      pid: Number(entry.ProcessId),
      ppid: Number(entry.ParentProcessId),
      rssBytes: Number(entry.WorkingSetSize || 0),
      command: typeof entry.CommandLine === "string" ? entry.CommandLine : ""
    };
  }).filter((entry) => Number.isFinite(entry.pid) && Number.isFinite(entry.ppid));
}

function relatedProcessMetricsFromRows(rows, roots) {
  const childrenByParent = new Map();
  const relatedPids = new Set();
  let count = 0;
  let rssBytes = 0;

  for (const row of rows) {
    if (!childrenByParent.has(row.ppid)) {
      childrenByParent.set(row.ppid, []);
    }
    childrenByParent.get(row.ppid).push(row.pid);
  }
  for (const root of roots) {
    collectDescendantPids(root, childrenByParent, relatedPids);
  }
  for (const row of rows) {
    if (!relatedPids.has(row.pid) || !isPhpProcessCommand(row.command)) {
      continue;
    }
    count++;
    rssBytes += Number.isFinite(row.rssBytes) ? row.rssBytes : 0;
  }

  return { count, rssBytes };
}

function collectDescendantPids(root, childrenByParent, relatedPids) {
  const stack = [root];

  while (stack.length > 0) {
    const pid = stack.pop();
    const children = childrenByParent.get(pid) || [];

    if (relatedPids.has(pid)) {
      continue;
    }
    relatedPids.add(pid);
    for (const child of children) {
      stack.push(child);
    }
  }
}

function isPhpProcessCommand(command) {
  const normalized = command.toLowerCase();

  return /(^|[\\/\s])php(?:\.exe)?(\s|$)/u.test(normalized)
    || normalized.includes("phpstan")
    || normalized.includes("psalm");
}

function registerAnalyzerInstallWatcher(analyzer) {
  if (!analyzerConfigured(currentAnalyzerSetting, analyzer)) {
    return;
  }
  if (currentWorkspaceRoot === "" || extensionContext === undefined) {
    return;
  }
  if (analyzerInstallWatchers.some((entry) => entry.analyzer === analyzer)) {
    return;
  }

  const patterns = analyzerInstallWatchPatterns(analyzer);
  for (const pattern of patterns) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(currentWorkspaceRoot, pattern));
    watcher.onDidCreate(() => restartWhenAnalyzerIsAvailable(analyzer));
    watcher.onDidChange(() => restartWhenAnalyzerIsAvailable(analyzer));
    analyzerInstallWatchers.push({ analyzer, watcher });
  }
  startAnalyzerInstallPolling();
  log("Watching for " + analyzer + " installation.");
}

function clearAnalyzerInstallWatchers() {
  for (const entry of analyzerInstallWatchers) {
    entry.watcher.dispose();
  }
  analyzerInstallWatchers = [];
  if (analyzerInstallPollTimer !== undefined) {
    clearInterval(analyzerInstallPollTimer);
    analyzerInstallPollTimer = undefined;
  }
  currentDriverLabel = "LSParrot Engine";
  currentWorkspaceRoot = "";
  currentAnalyzerSetting = [];
  lastLoggedProjectRoot = "";
  phpstanLevelIgnoredProjects = new Set();
  psalmLevelIgnoredProjects = new Set();
}

function startAnalyzerInstallPolling() {
  if (analyzerInstallPollTimer !== undefined) {
    return;
  }

  analyzerInstallPollTimer = setInterval(() => {
    const analyzers = [...new Set(analyzerInstallWatchers.map((entry) => entry.analyzer))];
    for (const analyzer of analyzers) {
      restartWhenAnalyzerIsAvailable(analyzer);
    }
  }, 10000);
}

function analyzerInstallWatchPatterns(analyzer) {
  const command = analyzerCommandName(analyzer);

  return [
    "vendor/bin/" + command,
    "**/vendor/bin/" + command,
    "**/bin/" + command,
    "composer.json",
    "composer.lock"
  ];
}

function restartWhenAnalyzerIsAvailable(analyzer) {
  if (!analyzerConfigured(currentAnalyzerSetting, analyzer)) {
    return;
  }
  if (!analyzerExists(currentWorkspaceRoot, analyzer)) {
    return;
  }

  log(formatAnalyzerName(analyzer) + " was found; restarting server.");
  if (analyzerRestartTimer !== undefined) {
    clearTimeout(analyzerRestartTimer);
  }
  analyzerRestartTimer = setTimeout(() => {
    analyzerRestartTimer = undefined;
    restart();
  }, 500);
}

function analyzerConfigured(setting, analyzer) {
  if (Array.isArray(setting)) {
    return setting.includes(analyzer);
  }

  return setting === analyzer;
}

function analyzerCommandName(analyzer) {
  return analyzer === "psalm-ls" ? "psalm-language-server" : analyzer;
}

function analyzerExists(root, analyzer) {
  const command = analyzerCommandName(analyzer);
  const candidates = new Set();
  const composerConfig = readComposerConfig(root);
  const vendorDir = typeof composerConfig["vendor-dir"] === "string" && composerConfig["vendor-dir"] !== "" ? composerConfig["vendor-dir"] : "vendor";
  const binDir = typeof composerConfig["bin-dir"] === "string" && composerConfig["bin-dir"] !== "" ? composerConfig["bin-dir"] : "";

  candidates.add(path.join(root, "vendor", "bin", command));
  if (binDir !== "") {
    candidates.add(path.join(resolveConfiguredPath(root, binDir), command));
  } else {
    candidates.add(path.join(resolveConfiguredPath(root, vendorDir), "bin", command));
  }

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return true;
    }
  }
  if (analyzerExistsInComposerProjects(root, command, 0)) {
    return true;
  }

  return executableOnPath(command);
}

function analyzerExistsInComposerProjects(directory, analyzer, depth) {
  if (depth > 8) {
    return false;
  }

  if (fileExists(path.join(directory, "composer.json"))) {
    const composerConfig = readComposerConfig(directory);
    const vendorDir = typeof composerConfig["vendor-dir"] === "string" && composerConfig["vendor-dir"] !== "" ? composerConfig["vendor-dir"] : "vendor";
    const binDir = typeof composerConfig["bin-dir"] === "string" && composerConfig["bin-dir"] !== "" ? composerConfig["bin-dir"] : "";
    const candidate = binDir !== ""
      ? path.join(resolveConfiguredPath(directory, binDir), analyzer)
      : path.join(resolveConfiguredPath(directory, vendorDir), "bin", analyzer);

    if (fileExists(candidate)) {
      return true;
    }
  }

  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (_error) {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipComposerScanDir(entry.name)) {
      continue;
    }
    if (analyzerExistsInComposerProjects(path.join(directory, entry.name), analyzer, depth + 1)) {
      return true;
    }
  }

  return false;
}

function shouldSkipComposerScanDir(name) {
  return name === "."
    || name === ".."
    || name === ".git"
    || name === ".cache"
    || name === "vendor"
    || name === "node_modules"
    || name === "var"
    || name === "tmp"
    || name === "build"
    || name === "dist";
}

function readComposerConfig(root) {
  const composerPath = path.join(root, "composer.json");
  try {
    const decoded = JSON.parse(fs.readFileSync(composerPath, "utf8"));
    return decoded && typeof decoded.config === "object" && decoded.config !== null ? decoded.config : {};
  } catch (_error) {
    return {};
  }
}

function resolveConfiguredPath(root, configuredPath) {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return path.join(root, configuredPath);
}

function executableOnPath(command) {
  const pathValue = process.env.PATH || "";
  for (const directory of pathValue.split(path.delimiter)) {
    if (directory !== "" && fileExists(path.join(directory, command))) {
      return true;
    }
  }

  return false;
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
}

function projectVscodeConfigPath(projectRoot) {
  return projectRoot !== "" ? path.join(projectRoot, ".lsparrot", "vscode_config.json") : "";
}

function readProjectVscodeConfig(projectRoot) {
  const configPath = projectVscodeConfigPath(projectRoot);

  if (configPath === "" || !fileExists(configPath)) {
    return {};
  }

  try {
    const decoded = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return decoded !== null && typeof decoded === "object" && !Array.isArray(decoded) ? decoded : {};
  } catch (_error) {
    return {};
  }
}

function writeProjectVscodeConfig(projectRoot, value) {
  const configPath = projectVscodeConfigPath(projectRoot);

  if (configPath === "") {
    return;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(value, null, 2) + "\n");
}

function mergeProjectVscodeConfig(current, updates) {
  const merged = Object.assign({}, current);

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

function projectConfigValue(projectConfig, key, fallback) {
  if (projectConfig !== undefined && projectConfig !== null && Object.prototype.hasOwnProperty.call(projectConfig, key)) {
    return projectConfig[key];
  }

  return fallback;
}

function projectAdditionalAnalyzerValue(projectConfig, fallback) {
  if (projectConfig !== undefined && projectConfig !== null && Object.prototype.hasOwnProperty.call(projectConfig, "additionalAnalyzer")) {
    return projectConfig.additionalAnalyzer;
  }
  if (projectConfig !== undefined && projectConfig !== null && Object.prototype.hasOwnProperty.call(projectConfig, "analyzer")) {
    return projectConfig.analyzer;
  }

  return fallback;
}

function projectConfigInteger(projectConfig, key, fallback) {
  return nonNegativeIntegerValue(projectConfigValue(projectConfig, key, fallback), fallback);
}

function ensureProjectVscodeConfig(projectRoot, defaults) {
  const current = readProjectVscodeConfig(projectRoot);
  const configPath = projectVscodeConfigPath(projectRoot);
  let changed = false;
  let merged = current;

  if (configPath === "") {
    return;
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      if (merged === current) {
        merged = Object.assign({}, current);
      }
      merged[key] = value;
      changed = true;
    }
  }

  if (changed || !fileExists(configPath)) {
    writeProjectVscodeConfig(projectRoot, merged);
  }
}

function persistActiveProjectVscodeConfigFromSettings(event) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const projectRoot = resolveActiveComposerProjectRoot();
  const current = readProjectVscodeConfig(projectRoot);
  const updates = {};

  if (projectRoot === "") {
    return;
  }

  if (event.affectsConfiguration(CONFIG_SECTION + ".additionalAnalyzer")) {
    if (!Object.prototype.hasOwnProperty.call(current || {}, "additionalAnalyzer") && !Object.prototype.hasOwnProperty.call(current || {}, "analyzer")) {
      updates.additionalAnalyzer = normalizeAnalyzer(config.get("additionalAnalyzer", []));
    }
  }
  if (event.affectsConfiguration(CONFIG_SECTION + ".phpstanLevel")) {
    if (projectPhpstanConfigPath(projectRoot) === "") {
      updates.phpstanLevel = nonNegativeIntegerConfig(config, "phpstanLevel", 6);
    } else {
      notifyIgnoredPhpstanLevelIfNeeded(projectRoot);
    }
  }
  if (event.affectsConfiguration(CONFIG_SECTION + ".psalmLevel")) {
    if (projectPsalmConfigPath(projectRoot) === "") {
      updates.psalmLevel = nonNegativeIntegerConfig(config, "psalmLevel", 6);
    } else {
      notifyIgnoredPsalmLevelIfNeeded(projectRoot);
    }
  }

  if (Object.keys(updates).length > 0) {
    writeProjectVscodeConfig(projectRoot, mergeProjectVscodeConfig(current, updates));
  }
}

function resolveActiveComposerProjectRootInWorkspace(workspaceRoot) {
  const editor = vscode.window.activeTextEditor;
  let root;

  if (editor !== undefined && editor.document.uri.scheme === "file") {
    root = findComposerRoot(path.dirname(editor.document.uri.fsPath), workspaceRoot);
    if (root !== "") {
      return root;
    }
  }
  if (fileExists(path.join(workspaceRoot, "composer.json"))) {
    return workspaceRoot;
  }

  return workspaceRoot;
}

function resolveActiveComposerProjectRoot() {
  const editor = vscode.window.activeTextEditor;
  if (editor !== undefined && editor.document.uri.scheme === "file") {
    const filePath = editor.document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const boundary = workspaceFolder !== undefined ? workspaceFolder.uri.fsPath : path.parse(filePath).root;
    const root = findComposerRoot(path.dirname(filePath), boundary);
    if (root !== "") {
      return root;
    }
    if (workspaceFolder !== undefined) {
      return workspaceFolder.uri.fsPath;
    }
  }

  if (currentWorkspaceRoot !== "") {
    return currentWorkspaceRoot;
  }

  return resolveWorkspaceRoot(extensionContext || { extensionPath: process.cwd() });
}

function findComposerRoot(directory, boundary) {
  let current = path.resolve(directory);
  const stop = path.resolve(boundary);

  while (current === stop || current.startsWith(stop + path.sep)) {
    if (fileExists(path.join(current, "composer.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return "";
}

function projectAnalyzerExists(projectRoot, analyzer) {
  const command = analyzerCommandName(analyzer);
  const composerConfig = readComposerConfig(projectRoot);
  const vendorDir = typeof composerConfig["vendor-dir"] === "string" && composerConfig["vendor-dir"] !== "" ? composerConfig["vendor-dir"] : "vendor";
  const binDir = typeof composerConfig["bin-dir"] === "string" && composerConfig["bin-dir"] !== "" ? composerConfig["bin-dir"] : "";
  const candidates = [];

  if (binDir !== "") {
    candidates.push(path.join(resolveConfiguredPath(projectRoot, binDir), command));
  } else {
    candidates.push(path.join(resolveConfiguredPath(projectRoot, vendorDir), "bin", command));
  }

  return candidates.some(fileExists);
}

function projectAnalyzerUsable(projectRoot, analyzer) {
  return projectAnalyzerExists(projectRoot, analyzer);
}

function projectPsalmConfigExists(projectRoot) {
  return projectPsalmConfigPath(projectRoot) !== "";
}

function projectPsalmConfigPath(projectRoot) {
  const names = ["psalm.xml", "psalm.xml.dist"];

  for (const name of names) {
    const candidate = path.join(projectRoot, name);
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return "";
}

function projectPhpstanConfigPath(projectRoot) {
  const names = ["phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon", ".phpstan.neon", ".phpstan.neon.dist"];

  for (const name of names) {
    const candidate = path.join(projectRoot, name);
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return "";
}

function notifyIgnoredPhpstanLevelIfNeeded(projectRoot) {
  const phpstanConfig = projectPhpstanConfigPath(projectRoot);
  let message;

  if (projectRoot === "" || phpstanLevelIgnoredProjects.has(projectRoot) || phpstanConfig === "") {
    return;
  }
  if (currentAnalyzerSetting !== "auto" && !analyzerConfigured(currentAnalyzerSetting, "phpstan")) {
    return;
  }

  phpstanLevelIgnoredProjects.add(projectRoot);
  message = "PHPStan level setting is disabled because " + path.basename(phpstanConfig) + " exists in " + projectRoot + ". Configure detailed PHPStan options in phpstan.neon.";
  log(message);
  vscode.window.showInformationMessage(message);
}

function notifyIgnoredPsalmLevelIfNeeded(projectRoot) {
  const psalmConfig = projectPsalmConfigPath(projectRoot);
  let message;

  if (projectRoot === "" || psalmLevelIgnoredProjects.has(projectRoot) || psalmConfig === "") {
    return;
  }
  if (currentAnalyzerSetting !== "auto" && !analyzerConfigured(currentAnalyzerSetting, "psalm") && !analyzerConfigured(currentAnalyzerSetting, "psalm-ls")) {
    return;
  }

  psalmLevelIgnoredProjects.add(projectRoot);
  message = "Psalm level setting is disabled because " + path.basename(psalmConfig) + " exists in " + projectRoot + ". Configure detailed Psalm options in psalm.xml.";
  log(message);
  vscode.window.showInformationMessage(message);
}

function parseStatusNumber(value, pathSegments) {
  let current = value;
  for (const segment of pathSegments) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }

  return Number.isFinite(Number(current)) ? Number(current) : undefined;
}

function numberOr(value, fallback) {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function parseSizeToBytes(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string" || value === "") {
    return undefined;
  }

  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)([kmgtp]?)(?:b)?$/i);
  if (match === null) {
    return undefined;
  }

  const units = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4, p: 1024 ** 5 };
  return Math.round(Number(match[1]) * units[match[2].toLowerCase()]);
}

function initialAnalyzerDriverLabel(setting, root) {
  const labels = ["LSParrot Engine"];

  if (Array.isArray(setting)) {
    if (setting.includes("phpstan") && analyzerExists(root, "phpstan")) {
      labels.push("PHPStan");
    }
    if (setting.includes("psalm") && analyzerExists(root, "psalm")) {
      labels.push("Psalm");
    }

    return labels.join(" + ");
  }

  if (setting === "auto") {
    if (analyzerExists(root, "phpstan")) {
      labels.push("PHPStan");
    }
    if (analyzerExists(root, "psalm")) {
      labels.push("Psalm");
    }

    return labels.join(" + ");
  }

  if (setting === "phpstan") {
    if (analyzerExists(root, "phpstan")) {
      labels.push("PHPStan");
    }

    return labels.join(" + ");
  }
  if (setting === "psalm") {
    if (analyzerExists(root, "psalm")) {
      labels.push("Psalm");
    }

    return labels.join(" + ");
  }

  return labels.join(" + ");
}

function formatAnalyzerName(value) {
  if (Array.isArray(value)) {
    const labels = ["LSParrot Engine"];

    for (const item of value) {
      const label = formatAnalyzerName(item);
      if (label !== "LSParrot Engine" && !labels.includes(label)) {
        labels.push(label);
      }
    }

    return labels.join(" + ");
  }
  if (typeof value === "string" && value.includes("+")) {
    return formatAnalyzerName(value.split("+"));
  }
  if (value === "lsparrot") {
    return "LSParrot Engine";
  }
  if (value === "phpstan") {
    return "PHPStan";
  }
  if (value === "psalm") {
    return "Psalm";
  }
  if (value === "psalm-ls") {
    return "Psalm LS";
  }
  return "LSParrot Engine";
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=,+-]+$/.test(value)) {
    return value;
  }

  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function stateName(state) {
  switch (state) {
    case State.Stopped:
      return "Stopped";
    case State.Starting:
      return "Starting";
    case State.Running:
      return "Running";
    default:
      return String(state);
  }
}

function phpString(value) {
  const stringValue = typeof value === "string" ? value : "auto";
  return "\"" + stringValue
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t") + "\"";
}

function normalizeAnalyzer(value) {
  if (Array.isArray(value)) {
    const analyzers = [];
    for (const item of value) {
      if ((item === "phpstan" || item === "psalm" || item === "psalm-ls") && !analyzers.includes(item)) {
        analyzers.push(item);
      }
    }

    return analyzers;
  }

  if (value === "auto" || value === "lsparrot" || value === "phpstan" || value === "psalm" || value === "psalm-ls") {
    return value;
  }

  return [];
}

function normalizePsalmTransport(value) {
  if (value === "cli" || value === "languageServer") {
    return value;
  }

  return "auto";
}

module.exports = {
  activate,
  deactivate
};
