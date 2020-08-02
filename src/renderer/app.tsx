/**
 * The top-level class controlling the whole app. This is *not* a React component,
 * but it does eventually render all components.
 *
 * @class App
 */
export class App {
  /**
   * Initial setup call, loading Monaco and kicking off the React
   * render process.
   */
  public async setup(): Promise<void | Element> {
    const React = await import("react");
    const { render } = await import("react-dom");
    const { Emulator } = await import("./emulator");

    const className = `${process.platform}`;
    const app = (
      <div className={className}>
        <Emulator />
      </div>
    );

    const rendered = render(app, document.getElementById("app"));

    return rendered;
  }
}

window["win95"] = window["win95"] || {
  app: new App(),
};

window["win95"].app.setup();
