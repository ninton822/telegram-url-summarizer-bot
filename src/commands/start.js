export default function register(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to Link Brief. Send any URL, and I will reply with a 3-sentence summary. x.com and twitter.com links are supported when the tweet or thread is publicly accessible."
    );
  });
}
