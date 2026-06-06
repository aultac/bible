function findRequestedNote(requestedAccountName, requestedFolderName, requestedNoteId) {
  const Notes = Application("Notes");
  Notes.includeStandardAdditions = false;

  for (const account of Notes.accounts()) {
    if (String(account.name()) !== requestedAccountName) {
      continue;
    }

    for (const folder of account.folders()) {
      if (String(folder.name()) !== requestedFolderName) {
        continue;
      }

      for (const note of folder.notes()) {
        if (String(note.id()) !== requestedNoteId) {
          continue;
        }

        return {
          accountName: String(account.name()),
          folderName: String(folder.name()),
          id: String(note.id()),
          title: String(note.name()),
          bodyHtml: String(note.body()),
        };
      }
    }
  }

  throw new Error(
    'Could not find note "' +
      requestedNoteId +
      '" in folder "' +
      requestedFolderName +
      '" for Notes account "' +
      requestedAccountName +
      '".'
  );
}

function run(argv) {
  const requestedAccountName = argv[0] || "";
  const requestedFolderName = argv[1] || "";
  const requestedNoteId = argv[2] || "";

  if (!requestedAccountName) {
    throw new Error("A Notes account name is required.");
  }

  if (!requestedFolderName) {
    throw new Error("A Notes folder name is required.");
  }

  if (!requestedNoteId) {
    throw new Error("A Notes note id is required.");
  }

  return JSON.stringify(
    findRequestedNote(requestedAccountName, requestedFolderName, requestedNoteId)
  );
}
