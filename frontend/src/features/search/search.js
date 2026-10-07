export function createSearchFeature({ player, workspace, library }) {
  return {
    runSearch: () => workspace.searchPanel && workspace.searchPanel.executeSearch(),
    playSearchResult: (result, index) => workspace.searchPanel && workspace.searchPanel.playResultMoment(result, index),
    syncActiveResultWithPlayhead: () => {},
    reset: () => workspace.searchPanel && workspace.searchPanel.reset(),
  };
}
