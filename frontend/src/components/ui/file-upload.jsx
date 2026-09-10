"use client";

import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export const FileUpload = ({
  onChange,
  className,
  title = "Upload required document",
  subtitle = "PDF, DOC, DOCX (max 10MB)",
  buttonText = "Select Document"
}) => {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (onChange) {
      onChange(files);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (onChange) {
      onChange(files);
    }
  };

  return (
    <div className={cn("w-full flex flex-col items-center", className)}>
      <div
        className={cn(
          "w-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-neutral-200 dark:border-neutral-800 bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-900"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-black shadow-sm">
          <Upload className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
        </div>
        
        <h3 className="mb-1 text-base font-medium text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
        
        <Button
          variant="outline"
          className="bg-white dark:bg-black"
          onClick={() => fileInputRef.current?.click()}
        >
          {buttonText}
        </Button>
        
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};
