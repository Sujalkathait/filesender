"use client";

import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "../../lib/utils";

export const FileUpload = ({
  onChange,
  onFileSelect,
  className,
  title = "Upload your files",
  subtitle = "Up to 20 files • Up to 1 GB total",
  buttonText = "Select Files",
  sectionLabel = null,
  fileInputRef: externalFileInputRef,
  supportsMultiple = true,
  isDragging: externalIsDragging,
  onDragOver: externalOnDragOver,
  onDragLeave: externalOnDragLeave,
  onDrop: externalOnDrop,
}) => {
  const internalFileInputRef = useRef(null);
  const fileInputRef = externalFileInputRef || internalFileInputRef;
  const [localIsDragging, setLocalIsDragging] = useState(false);
  const isDragging = externalIsDragging !== undefined ? externalIsDragging : localIsDragging;

  const handleFileChange = (e) => {
    if (onFileSelect) {
      onFileSelect(e);
    }
    const files = Array.from(e.target.files || []);
    if (onChange) {
      onChange(files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (externalOnDragOver) externalOnDragOver(e);
    setLocalIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (externalOnDragLeave) externalOnDragLeave(e);
    setLocalIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (externalOnDrop) externalOnDrop(e);
    setLocalIsDragging(false);
    if (onFileSelect) {
      onFileSelect(e);
    }
    const files = Array.from(e.dataTransfer.files || []);
    if (onChange) {
      onChange(files);
    }
  };

  return (
    <div className={cn("file-upload-wrapper", className)}>
      {sectionLabel && (
        <div className="file-upload-section-label">
          <span>{sectionLabel}</span>
          <span className="required-star">*</span>
        </div>
      )}
      <div
        className={`file-upload-box ${isDragging ? "is-dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload files drop zone. Click or drag and drop files here."
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="file-upload-icon-circle">
          <Upload size={24} />
        </div>

        <h3 className="file-upload-title">
          {title}
        </h3>

        <p className="file-upload-subtitle">
          {subtitle}
        </p>

        <button
          type="button"
          className="file-upload-select-btn"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          {buttonText}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          className="file-input"
          multiple={supportsMultiple}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
};
