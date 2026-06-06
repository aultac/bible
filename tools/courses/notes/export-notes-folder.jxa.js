function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function collectFolderSnapshot(account, folder) {
  const notes = folder.notes();
  const items = [];

  for (const note of notes) {
    items.push({
      id: String(note.id()),
      title: String(note.name()),
      createdAt: toIsoString(note.creationDate()),
      updatedAt: toIsoString(note.modificationDate()),
    });
  }

  return {
    accountName: String(account.name()),
    folderName: String(folder.name()),
    noteCount: items.length,
    notes: items,
  };
}

function run(argv) {
  const requestedAccountName = argv[0] || "";
  const requestedFolderName = argv[1] || "";

  if (!requestedFolderName) {
    throw new Error("A Notes folder name is required.");
  }

  const Notes = Application("Notes");
  Notes.includeStandardAdditions = false;

  const matches = [];

  for (const account of Notes.accounts()) {
    const accountName = String(account.name());
    if (requestedAccountName && accountName !== requestedAccountName) {
      continue;
    }

    for (const folder of account.folders()) {
      if (String(folder.name()) !== requestedFolderName) {
        continue;
      }

      matches.push(collectFolderSnapshot(account, folder));
    }
  }

  if (matches.length === 0) {
    if (requestedAccountName) {
      throw new Error(
        'Could not find folder "' +
          requestedFolderName +
          '" in Notes account "' +
          requestedAccountName +
          '".'
      );
    }

    throw new Error('Could not find folder "' + requestedFolderName + '" in Notes.');
  }

  if (matches.length > 1 && !requestedAccountName) {
    throw new Error(
      'Found multiple folders named "' +
        requestedFolderName +
        '". Re-run with an explicit account name.'
    );
  }

  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    requestedAccountName: requestedAccountName || null,
    requestedFolderName,
    matches,
  });
}
