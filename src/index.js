'use strict'

const fs = require('fs')
const got = require('got').default
const cheerio = require('cheerio')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

class LightMALScrapper {
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

class DeepMALScrapper {
    currentIndex = 0
    dataCrawled = []

    constructor(data) {
        this.lightData = data
    }

    gotInstance() {
        return got.extend({
            prefixUrl: 'https://myanimelist.net/'
        })
    }

    async doDeepCrawl() {
        let url = `anime/${this.lightData[this.currentIndex].id}`
        
        const getBasicInfo = async () => {
            let raw = await this.gotInstance().get(url)
            let $ = cheerio.load(raw.body)

            let basePath = $('head link[rel="canonical"]').attr('href').split('/').pop()

            return {
                title: $('h1.title-name').text().trim(),
                score: parseInt($('.score .score-label').text().trim()),
                rank: parseInt($('.numbers.ranked strong').text().trim().replace('#', '')),
                popularity: parseInt($('.numbers.popularity strong').text().trim().replace('#', '')),
                members: parseInt($('.numbers.members strong').text().trim().replace(',', '').trim()),
                description: $('p[itemprop="description"]').text()?.trim()?.replace('\n\n', '\n')?.replace('[Written by MAL Rewrite]', ''),
                type: $('.spaceit_pad').eq(4).find('a').text().trim(),
                episodes: parseInt($('.spaceit_pad').eq(5).text().trim().split('\n').pop()),
                aired: $('.spaceit_pad').eq(7).text().trim().split('\n').pop().trim(),
                premiered: $('.spaceit_pad').eq(8).text().trim().split('\n').pop().trim(),
                broadcast: $('.spaceit_pad').eq(9).text().trim().split('\n').pop().trim(),
                producers: $('.spaceit_pad').eq(10).find('a').toArray().map(x => $(x).text().trim()),
                licensors: $('.spaceit_pad').eq(11).find('a').toArray().map(x => $(x).text().trim()),
                studios: $('.spaceit_pad').eq(12).find('a').toArray().map(x => $(x).text().trim()),
                source: $('.spaceit_pad').eq(13).text().trim().split('\n').pop().trim(),
                genres: $('.spaceit_pad').eq(14).find('a').toArray().map(x => $(x).text().trim()),
                basePath,
            }
        }

        const basicInfo = await getBasicInfo()

        const getCharactersInfo = async () => {
            let urlPath = `/${basicInfo.basePath}/characters`
            let raw = await this.gotInstance().get(url + urlPath)
            let $ = cheerio.load(raw.body)

            let charaList = $('.anime-character-container table').toArray().map(x => {
                x = $(x)

                const name = x.find('tbody tr td').eq(1).find('.spaceit_pad').eq(0).find('a').text().trim().replace(',', '')
                const isMain = x.find('tbody tr td').eq(1).find('.spaceit_pad').eq(1).text().trim() === 'Main'
                const charaUrl = x.find('tbody tr td').eq(0).find('a').attr('href')

                if ( !isMain ) return null
                if ( charaUrl?.includes('/people/') || !name ) return null
                return { name, isMain, charaUrl }
            }).filter(x => x)

            const getCharaDesc = async (charaUrl) => {
                let xraw = await got.get(charaUrl)
                let y$ = cheerio.load(xraw.body)

                return y$('#content table tbody tr td').not('.borderClass').children().remove().end().text()?.trim()
            }

            let countCharaIndex = 0
            while (countCharaIndex < charaList.length) {
                await sleep(500)
                charaList[countCharaIndex].desc = await getCharaDesc(charaList[countCharaIndex].charaUrl)
                countCharaIndex++
                //console.log(`Crawling character ${countCharaIndex}/${charaList.length} of anime ${this.currentIndex}/${this.lightData.length}...`)
            }

            return charaList
        }

        const charaInfo = await getCharactersInfo()

        return {
            ...basicInfo,
            characters: charaInfo
        }
    }

    async doDeepCrawlAll() {
        console.log('starting...')
        let dataCrawledPerSecond = 0.0

        while (this.currentIndex < this.lightData.length) {
            let startTime = Date.now()

            await sleep(1_000)
            let data = await this.doDeepCrawl()
            this.dataCrawled.push(data)
            this.currentIndex++

            let endTime = Date.now()
            let timeTaken = (endTime - startTime) / 1000
            let timeTakenSec = timeTaken % 60

            let ETA = ((this.lightData.length - this.currentIndex) * timeTakenSec) / 60

            // refresh console log
            process.stdout.clearLine()
            process.stdout.cursorTo(0)
            process.stdout.write(`Crawling anime ${this.currentIndex}/${this.lightData.length}, ETA: ${ETA.toFixed(2)} minutes, data crawled per second: ${dataCrawledPerSecond.toFixed(2)}`)
        }

        return this.dataCrawled
    }
}

const mainEntry = async () => {
    const Crawler = new DeepMALScrapper(require('../light-anime-data.json'))
    const dataCrwaled = await Crawler.doDeepCrawlAll()

    fs.writeFileSync('../deep-anime-data.json', JSON.stringify(dataCrwaled, null, 4))
}

mainEntry()