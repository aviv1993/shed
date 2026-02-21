import { TUI, ProcessTerminal, Container, Text, matchesKey, Key, isKeyRelease, type Component } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { CollectedData } from "../types.js";
import type { SidebarTab } from "./sidebar.js";
import { Sidebar } from "./sidebar.js";
import { HorizontalSplit } from "./horizontal-split.js";
import { DashboardView } from "./dashboard.js";
import { PackageListView } from "./package-list.js";
import { DockerView } from "./docker-view.js";
import { AppsView } from "./apps-view.js";
import { DevCachesView } from "./dev-caches-view.js";
import { NodeModulesView } from "./node-modules-view.js";
import { GitReposView } from "./git-repos-view.js";
import { CleanupView } from "./cleanup-view.js";
import { formatBytes, renderProgressBar } from "../utils.js";
import { spinnerFrame, formatElapsed } from "./spinner.js";

class ContentPane implements Component {
  activeView: Component | null = null;

  invalidate(): void {
    this.activeView?.invalidate();
  }

  render(width: number): string[] {
    if (!this.activeView) return ["  " + chalk.dim("Loading...")];
    return this.activeView.render(width);
  }

  handleInput(data: string): void {
    this.activeView?.handleInput?.(data);
  }
}

export class DepwatchApp {
  private tui: TUI;
  private root: Container;
  private header: Text;
  private footer: Text;
  private sidebar: Sidebar;
  private contentPane: ContentPane;
  private split: HorizontalSplit;

  // Views
  private dashboardView = new DashboardView();
  private brewListView = new PackageListView();
  private npmListView = new PackageListView();
  private dockerView = new DockerView();
  private appsView = new AppsView();
  private devCachesView = new DevCachesView();
  private nodeModulesView = new NodeModulesView();
  private gitReposView = new GitReposView();
  private cleanupView = new CleanupView();

  private data: CollectedData | null = null;
  private currentTab: SidebarTab = "dashboard";
  private focusOnContent = false;
  private progress: { done: number; total: number } | null = null;

  constructor(
    private collectFn: (onProgress?: (done: number, total: number) => void) => Promise<CollectedData>,
    private loadCacheFn: () => Promise<CollectedData | null>,
  ) {
    this.tui = new TUI(new ProcessTerminal());

    this.header = new Text("", 1, 1);
    this.footer = new Text("", 0, 1);
    this.sidebar = new Sidebar();
    this.contentPane = new ContentPane();

    this.split = new HorizontalSplit(this.sidebar, this.contentPane, 20);

    this.root = new Container();
    this.root.addChild(this.header);
    this.root.addChild(this.split);
    this.root.addChild(this.footer);

    this.updateHeader();
    this.updateFocusState();

    // Wire sidebar
    this.sidebar.onChange = (tab) => {
      this.currentTab = tab;
      this.updateContentView();
      this.tui.requestRender();
    };

    // Wire dashboard navigation
    this.dashboardView.onNavigate = (tab) => {
      this.sidebar.selectTab(tab);
      this.focusOnContent = true;
      this.updateFocusState();
      this.tui.requestRender();
    };

    // Wire back-to-sidebar callback
    const backFn = () => {
      this.focusOnContent = false;
      this.updateFocusState();
      this.tui.requestRender();
    };
    this.dashboardView.onBack = backFn;
    this.brewListView.onBack = backFn;
    this.npmListView.onBack = backFn;
    this.dockerView.onBack = backFn;
    this.appsView.onBack = backFn;
    this.devCachesView.onBack = backFn;
    this.nodeModulesView.onBack = backFn;
    this.gitReposView.onBack = backFn;
    this.cleanupView.onBack = backFn;

    // Wire refresh callbacks
    const refreshFn = () => this.refresh();
    const renderFn = () => { this.updateFooter(); this.tui.requestRender(); };
    this.cleanupView.onRefreshData = refreshFn;
    this.cleanupView.onRequestRender = renderFn;
    this.appsView.onRefreshData = refreshFn;
    this.appsView.onRequestRender = renderFn;
    this.brewListView.onRefreshData = refreshFn;
    this.brewListView.onRequestRender = renderFn;
    this.npmListView.onRefreshData = refreshFn;
    this.npmListView.onRequestRender = renderFn;
    this.dockerView.onRefreshData = refreshFn;
    this.dockerView.onRequestRender = renderFn;
    this.devCachesView.onRefreshData = refreshFn;
    this.devCachesView.onRequestRender = renderFn;
    this.nodeModulesView.onRefreshData = refreshFn;
    this.nodeModulesView.onRequestRender = renderFn;
    this.gitReposView.onRefreshData = refreshFn;
    this.gitReposView.onRequestRender = renderFn;

    // Keyboard handler
    this.tui.addInputListener((data) => {
      if (isKeyRelease(data)) return { consume: true };

      this.updateSplitHeight();

      if (matchesKey(data, Key.ctrl("c"))) {
        this.stop();
        return { consume: true };
      }
      if (matchesKey(data, "q") && !this.focusOnContent) {
        this.stop();
        return { consume: true };
      }

      if (matchesKey(data, "right") && !this.focusOnContent) {
        this.focusOnContent = true;
        this.updateFocusState();
        this.tui.requestRender();
        return { consume: true };
      }
      if (matchesKey(data, "escape") && this.focusOnContent) {
        this.focusOnContent = false;
        this.updateFocusState();
        this.tui.requestRender();
        return { consume: true };
      }

      if (matchesKey(data, "tab")) {
        this.focusOnContent = !this.focusOnContent;
        this.updateFocusState();
        this.tui.requestRender();
        return { consume: true };
      }

      if (!this.focusOnContent && matchesKey(data, "enter")) {
        this.focusOnContent = true;
        this.updateFocusState();
        this.tui.requestRender();
        return { consume: true };
      }

      if (matchesKey(data, "r") && !this.focusOnContent) {
        this.refresh();
        return { consume: true };
      }

      if (this.focusOnContent) {
        this.contentPane.handleInput(data);
      } else {
        this.sidebar.handleInput(data);
      }
      this.updateFooter();
      this.tui.requestRender();
      return { consume: true };
    });
  }

  private updateSplitHeight() {
    const reservedLines = 4;
    this.split.minHeight = Math.max(this.tui.terminal.rows - reservedLines, 10);
  }

  private updateFocusState() {
    const contentFocused = this.focusOnContent;
    this.sidebar.focused = !contentFocused;
    this.split.setFocus(contentFocused ? "right" : "left");

    this.dashboardView.focused = contentFocused;
    this.appsView.focused = contentFocused;
    this.brewListView.focused = contentFocused;
    this.npmListView.focused = contentFocused;
    this.nodeModulesView.focused = contentFocused;
    this.dockerView.focused = contentFocused;
    this.cleanupView.focused = contentFocused;
    this.devCachesView.focused = contentFocused;
    this.gitReposView.focused = contentFocused;

    this.updateFooter();
  }

  private updateHeader() {
    let title = chalk.bold.cyan(" depwatch");
    if (this.data) {
      const totalDevBytes =
        this.data.brew.totalBytes +
        this.data.npmGlobals.totalBytes +
        (this.data.nodeModules?.totalBytes ?? 0) +
        this.data.apps.totalBytes +
        this.data.devCaches.totalBytes;
      const diskTotal = this.data.totalDiskBytes;
      if (diskTotal > 0) {
        const pct = ((totalDevBytes / diskTotal) * 100).toFixed(1);
        title += chalk.dim(`   Total: ${formatBytes(totalDevBytes)} / ${formatBytes(diskTotal)} (${pct}%)`);
      }
    }
    this.header.setText(title);
  }

  private updateFooter() {
    // Check all views for active operations
    const op = this.getActiveOperation();

    let left: string;
    if (this.focusOnContent) {
      const view = this.contentPane.activeView as any;
      const hint = view?.getFooterHint?.() ?? "";
      const parts = hint ? [" ← back", hint] : [" ← back"];
      left = chalk.dim(" " + parts.join("  "));
    } else {
      left = chalk.dim("  q quit  r refresh  ↑↓ navigate  Enter/→ open");
    }

    let right = "";
    if (op) {
      right = chalk.yellow(`${op.label} ${spinnerFrame(op.tick)} ${formatElapsed(op.startMs)}`);
    } else if (this.progress) {
      right = chalk.cyan(`Scanning... ${renderProgressBar(this.progress.done, this.progress.total, 15)}`);
    }

    this.footer.setText(right ? left + "    " + right : left);
  }

  private getActiveOperation(): { label: string; tick: number; startMs: number } | null {
    const views = [
      this.brewListView, this.npmListView, this.dockerView,
      this.appsView, this.devCachesView, this.nodeModulesView,
      this.gitReposView, this.cleanupView,
    ] as any[];
    for (const view of views) {
      const status = view.getOperationStatus?.();
      if (status) return status;
    }
    return null;
  }

  private updateContentView() {
    switch (this.currentTab) {
      case "dashboard":
        this.contentPane.activeView = this.dashboardView;
        break;
      case "brew":
        this.contentPane.activeView = this.brewListView;
        break;
      case "npm":
        this.contentPane.activeView = this.npmListView;
        break;
      case "docker":
        this.contentPane.activeView = this.dockerView;
        break;
      case "apps":
        this.contentPane.activeView = this.appsView;
        break;
      case "node-modules":
        this.contentPane.activeView = this.nodeModulesView;
        break;
      case "ides":
        this.contentPane.activeView = this.devCachesView;
        break;
      case "git-repos":
        this.contentPane.activeView = this.gitReposView;
        break;
      case "cache-cleanups":
        this.contentPane.activeView = this.cleanupView;
        break;
    }
  }

  private populateViews(stale = false) {
    if (!this.data) return;

    this.dashboardView.setData(this.data, stale);
    this.brewListView.setBrewData(this.data.brew.packages, this.data.links);
    this.npmListView.setNpmData(this.data.npmGlobals.packages, this.data.links);
    this.dockerView.setData(this.data.docker);
    if (this.data.nodeModules) {
      this.nodeModulesView.setData(this.data.nodeModules);
    }
    this.appsView.setData(this.data.apps);
    this.devCachesView.setData(this.data.devCaches);
    if (this.data.gitRepos) {
      this.gitReposView.setData(this.data.gitRepos);
    }
    if (this.data.cleanupActions) {
      this.cleanupView.setData(this.data.cleanupActions);
    }

    this.sidebar.setCounts({
      brew: this.data.brew.packages.length,
      npm: this.data.npmGlobals.packages.length,
      "node-modules": this.data.nodeModules?.entries.length ?? 0,
      apps: this.data.apps.apps.length,
      ides: this.data.devCaches.entries.length,
      "git-repos": this.data.gitRepos?.repos.length ?? 0,
    });

    this.updateHeader();
    this.updateContentView();
  }

  async start() {
    // Enter alternate screen buffer so TUI doesn't pollute scrollback
    process.stdout.write("\x1b[?1049h");
    this.tui.addChild(this.root);
    this.tui.start();

    this.contentPane.activeView = this.dashboardView;
    this.updateSplitHeight();
    this.updateFocusState();
    this.tui.requestRender();

    // Try loading cached data first for instant display
    const cached = await this.loadCacheFn();
    if (cached) {
      this.data = cached;
      this.populateViews(true); // mark as stale
      this.tui.requestRender();
    }

    // Then collect fresh data in background
    await this.loadData();
  }

  private async loadData() {
    this.progress = { done: 0, total: 11 };
    this.updateFooter();
    this.tui.requestRender();

    try {
      this.data = await this.collectFn((done, total) => {
        this.progress = { done, total };
        this.updateFooter();
        this.tui.requestRender();
      });
      this.populateViews();
    } catch {
      // Graceful degradation
    }

    this.progress = null;
    this.updateFooter();
    this.tui.requestRender();
  }

  private async refresh() {
    this.data = null;
    this.dashboardView.setData(null as any);
    this.tui.requestRender();
    await this.loadData();
  }

  stop() {
    this.tui.stop();
    // Leave alternate screen buffer — restores the terminal to pre-TUI state
    process.stdout.write("\x1b[?1049l");
    process.exit(0);
  }
}
