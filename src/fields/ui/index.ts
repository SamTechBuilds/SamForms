import type { ComponentType } from "react";
import {
  AlignLeft, AtSign, Calendar, CalendarRange, CheckSquare, ChevronDownSquare, CircleDot, Clock, DollarSign, Gauge, Hash,
  Heading, Image as ImageIcon, ImagePlus, Link, Minus, Palette, PenLine, Phone, SlidersHorizontal, Star, Text, ToggleLeft,
  Type, Upload, User, type LucideIcon, ThumbsUp,
} from "lucide-react";
import type { FieldType } from "@/schema/form";
import * as I from "./inputs";
import * as E from "./editors";

export interface FieldUi {
  icon: LucideIcon;
  /** Respondent-facing input (preview now, public renderer in Phase 3). Undefined for content blocks. */
  Input?: ComponentType<I.FieldInputProps>;
  /** Type-specific settings in the builder (generic settings are shared). */
  ConfigEditor?: ComponentType<E.ConfigEditorProps>;
}

/** UI half of the field registry; Record<FieldType, …> makes a missing type a compile error. */
export const fieldUi: Record<FieldType, FieldUi> = {
  short_text: { icon: Type, Input: I.ShortTextInput },
  long_text: { icon: AlignLeft, Input: I.LongTextInput, ConfigEditor: E.LongTextEditor },
  name: { icon: User, Input: I.NameInput, ConfigEditor: E.NameEditor },
  email: { icon: AtSign, Input: I.EmailInput },
  phone: { icon: Phone, Input: I.PhoneInput, ConfigEditor: E.PhoneEditor },
  url: { icon: Link, Input: I.UrlInput },
  number: { icon: Hash, Input: I.NumberInput, ConfigEditor: E.NumberEditor },
  currency: { icon: DollarSign, Input: I.CurrencyInput, ConfigEditor: E.CurrencyEditor },
  single_choice: { icon: CircleDot, Input: I.SingleChoiceInput, ConfigEditor: E.ChoiceEditor },
  multiple_choice: { icon: CheckSquare, Input: I.MultipleChoiceInput, ConfigEditor: E.ChoiceEditor },
  dropdown: { icon: ChevronDownSquare, Input: I.DropdownInput },
  yes_no: { icon: ThumbsUp, Input: I.YesNoInput, ConfigEditor: E.YesNoEditor },
  toggle: { icon: ToggleLeft, Input: I.ToggleInput, ConfigEditor: E.ToggleEditor },
  date: { icon: Calendar, Input: I.DateInput, ConfigEditor: E.DateEditor },
  time: { icon: Clock, Input: I.TimeInput, ConfigEditor: E.TimeEditor },
  date_range: { icon: CalendarRange, Input: I.DateRangeInput, ConfigEditor: E.DateRangeEditor },
  star_rating: { icon: Star, Input: I.StarRatingInput, ConfigEditor: E.StarEditor },
  linear_scale: { icon: SlidersHorizontal, Input: I.LinearScaleInput, ConfigEditor: E.LinearScaleEditor },
  opinion_scale: { icon: Gauge, Input: I.OpinionScaleInput, ConfigEditor: E.OpinionScaleEditor },
  file_upload: { icon: Upload, Input: I.FileUploadInput, ConfigEditor: E.FileUploadEditor },
  image_upload: { icon: ImagePlus, Input: I.ImageUploadInput, ConfigEditor: E.ImageUploadEditor },
  signature: { icon: PenLine, Input: I.SignatureInput, ConfigEditor: E.SignatureEditor },
  color_picker: { icon: Palette, Input: I.ColorPickerInput },
  heading: { icon: Heading, ConfigEditor: E.HeadingEditor },
  description: { icon: Text },
  image: { icon: ImageIcon, ConfigEditor: E.ImageEditor },
  divider: { icon: Minus },
};

export { ContentBlock } from "./inputs";
export type { FieldInputProps } from "./inputs";
