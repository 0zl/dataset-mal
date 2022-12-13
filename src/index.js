'use strict'

const fs = require('fs')
const got = require('got').default
const cheerio = require('cheerio')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

class MALCrawler {
    page = 1

    gotInstance() {
        return got.extend({
            prefixUrl: 'https://myanimelist.net/'
        })
    }

    async doLightCrawl() {
        let raw = await this.gotInstance().get(`topanime.php?limit=${(this.page === 1 ? 0 : this.page * 50)}`)
        let $ = cheerio.load(raw.body)
        return $('table.top-ranking-table .ranking-list').toArray().map(x => {
            x = $(x)
            return {
                id: parseInt(x.find('td.title a').attr('href').split('/')[4]),
                title: x.find('td.title a').text().trim(),
                rank: parseInt(x.find('td.rank').text().trim()),
                score: x.find('td.score').text().trim(),
                details: x.find('td.title .detail .information').text().trim()?.split('\n').map(x => x.trim()).filter(x => x !== '')
            }
        })
    }

    async lightCrawl() {
        const totalAnime = 23500

        let data = []
        while (this.page * 50 < totalAnime) {
            await sleep(1_000)
            data = data.concat(await this.doLightCrawl())
            this.page++

            // refresh console log
            process.stdout.clearLine()
            process.stdout.cursorTo(0)
            process.stdout.write(`Crawling page ${this.page}/${Math.ceil(totalAnime / 50)}, total anime crawled: ${data.length}`)
        }

        return data
    }
}

const mainEntry = async () => {
    const Crawler = new MALCrawler()
    let lightData = await Crawler.lightCrawl()

    fs.writeFileSync('./light-data.json', JSON.stringify(lightData, null, 4))
}

mainEntry()