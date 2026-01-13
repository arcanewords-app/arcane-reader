/**
 * Type definitions for epub-gen
 */

declare module 'epub-gen' {
  interface EpubOptions {
    title: string;
    author?: string;
    lang?: string;
    content: Array<{
      title: string;
      data: string;
    }>;
    output?: string;
    publisher?: string;
    description?: string;
    [key: string]: any;
  }

  class Epub {
    constructor(options: EpubOptions);
    promise: Promise<void>;
  }

  export = Epub;
}
