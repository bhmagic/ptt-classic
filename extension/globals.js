import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom';
import Hammer from 'hammerjs';

// Preserve the globals previously supplied by the classic site's CDN scripts.
Object.assign(window, { $, jQuery: $, React, ReactDOM, Hammer });

export { $, React, ReactDOM, Hammer };
