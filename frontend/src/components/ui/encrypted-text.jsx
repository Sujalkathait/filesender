"use client";

import React, { useEffect, useState, useRef } from "react";
import { cn } from "../../lib/utils";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";

export const EncryptedText = ({
  text,
  encryptedClassName,
  revealedClassName,
  revealDelayMs = 30,
  className
}) => {
  const [displayText, setDisplayText] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const iterations = useRef(0);

  useEffect(() => {
    let interval;
    const animate = () => {
      let currentText = "";
      for (let i = 0; i < text.length; i++) {
        if (i < iterations.current) {
          currentText += text[i];
        } else if (text[i] === " ") {
          currentText += " ";
        } else {
          currentText += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      setDisplayText(currentText);

      if (iterations.current >= text.length) {
        clearInterval(interval);
        setIsRevealed(true);
      }
      
      iterations.current += 1/3; // Controls speed of reveal
    };

    interval = setInterval(animate, revealDelayMs);
    return () => clearInterval(interval);
  }, [text, revealDelayMs]);

  return (
    <span
      className={cn(
        isRevealed ? revealedClassName : encryptedClassName,
        className,
        "transition-colors duration-300 font-mono"
      )}
    >
      {displayText}
    </span>
  );
};
