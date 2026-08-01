export type BookSize = 'square_8x8' | 'landscape_11x8' | 'portrait_8x10' | 'large_12x12';
export type PaperFinish = 'matte' | 'glossy' | 'linen';
export type BindingType = 'softcover' | 'hardcover' | 'layflat';
export type LayoutStyle = 'classic' | 'editorial' | 'grid' | 'collage' | 'minimal';
export type CoverStyle = 'full_bleed' | 'framed' | 'minimal' | 'split';
export type WizardMode = 'auto' | 'custom';

export interface BookSettings {
  name: string;
  size: BookSize;
  pageCount: number;
  paperFinish: PaperFinish;
  binding: BindingType;
}

export interface UploadedPhotoLocal {
  id: string;
  file: File;
  dataUrl: string;
  filename: string;
  width: number;
  height: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  warning?: 'low_res' | 'very_low_res';
  serverUrl?: string;
  serverId?: string;
}

export interface WizardState {
  mode: WizardMode;
  projectId?: string;
  bookSettings: BookSettings;
  photos: UploadedPhotoLocal[];
  layoutStyle: LayoutStyle;
  themeId: string;
  themeName: string;
  themeImageUrl: string;
  coverStyle: CoverStyle;
  frontCoverPhotoIndex: number;   // index into photos array
  backCoverPhotoIndex: number;
  bookTitle: string;
}

export const defaultWizardState: WizardState = {
  mode: 'auto',
  bookSettings: {
    name: '',
    size: 'square_8x8',
    pageCount: 20,
    paperFinish: 'matte',
    binding: 'softcover',
  },
  photos: [],
  layoutStyle: 'classic',
  themeId: '',
  themeName: '',
  themeImageUrl: '',
  coverStyle: 'full_bleed',
  frontCoverPhotoIndex: 0,
  backCoverPhotoIndex: -1,
  bookTitle: '',
};
