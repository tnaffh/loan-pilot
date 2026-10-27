import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Camera, FileText, FolderOpen, ImageIcon, Plus, X } from 'lucide-react-native';
import { Image } from '@/components/styled';
import { Badge, ListRow, Sheet, Text } from '@/components/ui';
import { MAX_FILES_PER_DOCUMENT_SLOT } from '@loan-pilot/domain';
import type { UploadFile } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';

/** The API accepts PDF/JPG/PNG up to 10 MB per file. */
const MAX_BYTES = 10 * 1024 * 1024;

const tooLarge = (size: number | null | undefined): boolean =>
  typeof size === 'number' && size > MAX_BYTES;

type Source = 'camera' | 'library' | 'files';

/**
 * Pick a document from the camera, the photo library or Files (PDF). Returns
 * null when the applicant cancels or a permission is refused.
 */
export const pickDocument = async (source: Source): Promise<UploadFile | null> => {
  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets[0];

    if (!asset) return null;

    if (tooLarge(asset.size)) {
      Alert.alert('File too large', 'Please choose a file smaller than 10 MB.');

      return null;
    }

    return { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/pdf' };
  }

  // The system photo picker hands over only the chosen photo, so the library
  // needs no permission; only the camera does.
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to photograph your documents.',
      );

      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    // iPhones store HEIC; ask for a JPEG so the API (PDF/JPG/PNG only) accepts it.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];

  if (!asset) return null;

  if (tooLarge(asset.fileSize)) {
    Alert.alert('Photo too large', 'Please retake the photo at a lower resolution.');

    return null;
  }

  return asUploadImage(asset.uri, asset.fileName);
};

/**
 * Name and type a picked photo by the file actually written (a JPEG or PNG
 * after re-encoding), not the library's original name, which may say .heic.
 */
const asUploadImage = (uri: string, originalName: string | null | undefined): UploadFile => {
  const png = /\.png$/i.test(uri);
  const base = (originalName ?? `photo-${Date.now()}`).replace(/\.[^.]+$/, '');

  return { uri, name: `${base}.${png ? 'png' : 'jpg'}`, type: png ? 'image/png' : 'image/jpeg' };
};

/** Bottom sheet offering camera / library / files. */
export const SourceSheet = ({
  open,
  onClose,
  onPick,
  title,
  allowFiles = true,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: UploadFile) => void;
  title: string;
  allowFiles?: boolean;
}) => {
  const choose = async (source: Source) => {
    onClose();
    // Let the sheet finish closing before a native picker presents over it.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const file = await pickDocument(source);

    if (file) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPick(file);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ListRow
        icon={Camera}
        title="Take a photo"
        subtitle="Lay it flat in good light"
        onPress={() => void choose('camera')}
      />
      <ListRow
        icon={ImageIcon}
        title="Choose from photos"
        divider
        onPress={() => void choose('library')}
      />
      {allowFiles ? (
        <ListRow
          icon={FolderOpen}
          title="Choose a PDF or file"
          divider
          onPress={() => void choose('files')}
        />
      ) : null}
    </Sheet>
  );
};

/** A picked file: thumbnail (photos) or document icon, its name, and remove. */
const FileRow = ({ file, onRemove }: { file: UploadFile; onRemove: () => void }) => {
  const colors = useColors();
  const isImage = file.type.startsWith('image/');

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-2.5">
      <View className="size-11 items-center justify-center overflow-hidden rounded-lg bg-secondary">
        {isImage ? (
          <Image source={{ uri: file.uri }} className="size-11" contentFit="cover" />
        ) : (
          <FileText size={20} color={colors.secondaryForeground} />
        )}
      </View>
      <Text variant="small" numberOfLines={1} className="flex-1">
        {file.name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${file.name}`}
        hitSlop={10}
        onPress={onRemove}
        className="size-8 items-center justify-center rounded-full bg-muted"
      >
        <X size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
};

/**
 * One supporting-document slot holding one or more files — a statement often
 * comes as one PDF per month, an ID as front and back photos.
 */
export const DocumentSlot = ({
  label,
  required,
  files,
  error,
  onAdd,
  onRemove,
}: {
  label: string;
  required: boolean;
  files: UploadFile[];
  error?: string;
  onAdd: (file: UploadFile) => void;
  onRemove: (index: number) => void;
}) => {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const canAdd = files.length < MAX_FILES_PER_DOCUMENT_SLOT;

  return (
    <View className="gap-1.5">
      {files.length > 0 ? (
        <View className="flex-row items-center justify-between">
          <Text variant="bodyMedium">{label}</Text>
          <Text variant="caption" tone="muted">
            {files.length} file{files.length === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}
      {files.map((file, index) => (
        <FileRow key={`${file.uri}-${index}`} file={file} onRemove={() => onRemove(index)} />
      ))}
      {canAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={files.length > 0 ? `Add another file to ${label}` : `Add ${label}`}
          onPress={() => setOpen(true)}
          className={cn(
            'flex-row items-center gap-3.5 rounded-xl border border-dashed border-input bg-card p-3',
            error && 'border-destructive',
          )}
        >
          <View className="size-11 items-center justify-center rounded-lg bg-secondary">
            <Plus size={20} color={colors.secondaryForeground} />
          </View>
          {files.length > 0 ? (
            <Text variant="small" tone="muted" className="flex-1">
              Add another file
            </Text>
          ) : (
            <View className="flex-1 gap-1">
              <Text variant="bodyMedium">{label}</Text>
              <Badge
                label={required ? 'Required' : 'Optional'}
                tone={required ? 'brand' : 'neutral'}
              />
            </View>
          )}
        </Pressable>
      ) : null}
      {error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : null}
      <SourceSheet open={open} onClose={() => setOpen(false)} onPick={onAdd} title={label} />
    </View>
  );
};
