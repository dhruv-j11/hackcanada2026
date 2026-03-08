/// <reference types="vite/client" />

import React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
    interface Element extends React.JSX.Element {}
    interface ElementClass extends React.JSX.ElementClass {}
    // @ts-ignore
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
  }
}
