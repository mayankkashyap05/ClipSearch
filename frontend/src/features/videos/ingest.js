export function createIngestFeature({ workspace, refreshVideos }) {
  return {
    reset: () => workspace.ingestDrawer && workspace.ingestDrawer.reset(),
    showError: msg => {},
    clearError: () => {},
  };
}
