import React from 'react';
import { formatBytes } from '../../utils/format';
import { FileUpload } from '../ui/file-upload';

/**
 * Upload DropZone Component
 * Primary Responsibility: Handle file drag-and-drop area and file input picker triggers.
 */
export function DropZone({
  files,
  isDragging,
  totalSelectedSize,
  supportsMultiple,
  fileInputRef,
  onDragOver,
  onDrop,
  onFileSelect
}) {
  return (
      <FileUpload
        onChange={(newFiles) => {
          if (fileInputRef.current) {
            // we simulate an event object to reuse existing logic if needed
            const event = { target: { files: newFiles } };
            onFileSelect(event);
          }
        }}
        title={files.length > 0 ? `${files.length} file(s) selected` : 'Upload required document'}
        subtitle={
          files.length > 0
            ? `${formatBytes(totalSelectedSize)} selected • ${files.length} of max 20 file(s)`
            : 'Select up to 20 files • Up to 1 GB total'
        }
        buttonText={files.length > 0 ? 'Add more files' : 'Select Document'}
      />
  );
}
