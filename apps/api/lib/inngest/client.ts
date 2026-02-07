import { Inngest, EventSchemas } from "inngest";

type DocumentEvents = {
  "document/process": {
    data: {
      documentId: string;
      projectId: string | null;
      filename: string;
      mimeType: string;
      storagePath?: string;
      sourceUrl?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "gehalt-pflege",
  schemas: new EventSchemas().fromRecord<DocumentEvents>(),
});
