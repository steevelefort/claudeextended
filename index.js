// ==UserScript==
// @name         ClaudeExtended
// @namespace    http://tampermonkey.net/
// @version      2024-12-01
// @description  Add Internet access to Claude AI
// @author       Steeve Lefort
// @match        https://claude.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=claude.ai
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
  'use strict';

  console.log("Démarrage de ClaudeExtended")

  const ddgBase = "https://html.duckduckgo.com/html?q=";
  const endMark = " --- Search end ---";

  let editor = null;
  let waitPopup = null;
  let searching = false;

  function search(text) {
    return new Promise((resolve, reject) => {
      const searchQuery = `${ddgBase}${encodeURI(text)}`;
      console.log(searchQuery)
      var options = {
        method: 'GET',
        url: searchQuery,
        onload: function(response) {
          const parser = new DOMParser();
          const html = parser.parseFromString(response.responseText, 'text/html');
          const serp = Array.from(html.querySelectorAll(".results>.result"));
          const links = serp.map(link => "https:" + link.querySelector("a").getAttribute("href"));
          resolve(links);
        }
      };
      GM_xmlhttpRequest(options);
    })
  }

  function getRedirect(url) {
    return new Promise((resolve, reject) => {
      var options = {
        method: 'GET',
        url: url,
        followRedirect: true, // Enable following redirects
        onload: function(response) {
          const parser = new DOMParser();
          const html = parser.parseFromString(response.responseText, 'text/html');
          const content = html.querySelector("meta[http-equiv=refresh]") //.getAttribute("baseURI");
          const parts = content.content.split('=');
          resolve(parts[1]);
        }
      };
      GM_xmlhttpRequest(options);
    })
  }

  function getSite(url) {
    console.log("Try to get site " + url)
    return new Promise((resolve, reject) => {
      var options = {
        method: 'GET',
        url: url,
        followRedirect: true, // Enable following redirects
        onload: function(response) {
          const parser = new DOMParser();
          const html = parser.parseFromString(response.responseText, 'text/html');
          let main = html.querySelector("main,*[role='main'],body");
          // if (main === null) {
          //   main = html.querySelector("body");
          // }
          const scripts = main.querySelectorAll("script,link,img,svg,nav,header,footer,aside,style,noscript");
          for (const script of scripts) {
            script.remove();
          }
          resolve(main.textContent.replace(/\s\s+/g, ' ').replace(/^\s*[\r\n]/gm, ''));
        }
      };
      GM_xmlhttpRequest(options);
    })
  }

  function insertAtEnd(text) {
    const endPos = editor.state.doc.content.size - 1;
    const transaction = editor.state.tr.insertText(text.replace(/(\r?\n){2,}/g, '\n'), endPos);
    editor.view.dispatch(transaction);
  }

  function insertHtmlAttachmentAtEnd(htmlContent) {
    const endPos = editor.state.doc.content.size - 1;

    // Créer le nœud de type attachment pour du HTML
    const attachmentNode = editor.schema.nodes.attachment.create({
      content: htmlContent.replace(/(\r?\n){2,}/g, '\n'),
      type: 'text/html',  // Spécifier le type comme HTML
      identifier: `html-${Date.now()}`,
      title: `HTML Content ${new Date().toLocaleString()}`
    });

    // Insérer le nœud à la fin
    const transaction = editor.state.tr.insert(endPos, attachmentNode);
    editor.view.dispatch(transaction);
  }

  // Exemple d'utilisation :
  // insertHtmlAttachmentAtEnd('<div class="example">Mon contenu HTML</div>');

  async function run(text) {
    const urls = await search(text)
    // urls.splice(3); // Keeps only 3 results
    urls.splice(1); // Keeps only the first result

    const promisesRedirect = [];
    for (const url of urls) {
      promisesRedirect.push(getRedirect(url));
    }
    const redirects = await Promise.all(promisesRedirect)
    console.log(redirects)

    const promisesContent = [];
    for (const url of redirects) {
      promisesContent.push(getSite(url));
    }
    const contents = await Promise.all(promisesContent)
    // console.log(contents);
    for (const content of contents) {
      console.log(content)
    }

    let add = "\r\nInformation found on the Internet :\r\n";

    for (const content of contents) {
      add += "\r\n------------------\r\n";
      add += content;
    }
    add += endMark;
    // insertAtEnd(add);
    insertHtmlAttachmentAtEnd(add);
    console.log("Insertion des résultats dans l’éditeur")

    // Ugly method to change !
    // setTimeout(() => {
    //   const fireButton = document.querySelector("button[aria-label='Send Message']");
    //   fireButton.click();
    //   waitPopup.style.display = "none";
    // }, 500)

  }

  window.addEventListener('load', function() {
    const handle = this.setInterval(() => {
      console.log("Recherche de ProseMirror ...");
      const inputZone = document.querySelector(".ProseMirror");
      const claudeExtend = document.querySelector(".claudeExtend");
      if (inputZone != null && claudeExtend == null) {
        editor = inputZone.editor;

        const textZone = inputZone.querySelector("p")

        const observer = new MutationObserver(function() {
          console.log("Editeur modifié");
          const markFound = textZone.textContent.slice(-endMark.length) == endMark;
          if (searching && markFound) {
            console.log("Recherche terminée")

            const fireButton = document.querySelector("button[aria-label='Send Message'],div[cmdk-item]>button");
            setTimeout(() => {
              console.log("Pressing send message");
              fireButton.click();
              waitPopup.style.display = "none";
              searching = false;
            }, 100)
          }

        });

        observer.observe(textZone, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true
        });





        const uploadButton = document.querySelector("input[aria-label='Upload files']")
        const sendButton = document.querySelector("input[aria-label='Send Message']")

        const searchButton = document.createElement("button")
        searchButton.innerText = "🔍";
        searchButton.className = "claudeExtend";
        inputZone.parentNode.parentNode.appendChild(searchButton);
        searchButton.style.padding = "4px 5px";
        searchButton.style.borderRadius = "12px";
        searchButton.style.width = "2rem";
        searchButton.style.height = "2rem";
        searchButton.style.backgroundColor = "#07D";

        const searchInput = document.createElement("input");
        uploadButton.parentNode.parentNode.parentNode.appendChild(searchInput);

        searchInput.placeholder = "Add a search engine query here if needed";
        searchInput.style.border = "none";
        searchInput.style.backgroundColor = "inherit";
        searchInput.style.width = "100%";
        searchInput.style.marginTop = "10px";
        searchInput.style.padding = "8px 16px";

        searchButton.addEventListener("click", () => {

          waitPopup.style.display = "flex";
          searching = true;

          if (searchInput.value.length > 0)
            run(searchInput.value);
          else {
            searchInput.value = editor.state.doc.textContent;
            run(searchInput.value);
          }
          searchInput.value = "";


        })

        waitPopup = document.createElement("div");
        waitPopup.style.display = "none";
        waitPopup.style.position = "absolute";
        waitPopup.style.top = 0;
        waitPopup.style.left = 0;
        waitPopup.style.width = "100vw";
        waitPopup.style.height = "100vh";
        waitPopup.style.zIndex = 1000;
        waitPopup.style.backgroundColor = "rgba(0,0,0,.5)";
        waitPopup.style.alignItems = "center";
        waitPopup.style.justifyContent = "center";

        const message = document.createElement("div");
        message.style.backgroundColor = "#444";
        message.style.color = "#fff";
        message.style.padding = "20px 40px";
        message.style.borderRadius = "10px";
        message.innerText = "🌐 Browsing the web ...";

        waitPopup.appendChild(message);

        document.body.appendChild(waitPopup);

      }
    }, 500);
  });

})();
