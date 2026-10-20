/** One asynchronous query in flight; never block rendering or compete with an enclosing probe. */
export class GpuFrameTime {
  private pending: { query: WebGLQuery; scale: number } | undefined;

  private readonly gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  begin(getScale: () => number, consume: (ms: number, scale: number) => void): (() => void) | undefined {
    const { gl } = this;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext || gl.isContextLost()) {
      return;
    }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (this.pending) {
      const { query, scale: measuredScale } = this.pending;
      if (disjoint || gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!disjoint) {
          consume(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6, measuredScale);
        }
        gl.deleteQuery(query);
        this.pending = undefined;
      }
    }
    if (this.pending || disjoint || gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
      return;
    }
    const query = gl.createQuery();
    if (!query) {
      return;
    }
    const scale = getScale();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    return () => {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.pending = { query, scale };
    };
  }
}
